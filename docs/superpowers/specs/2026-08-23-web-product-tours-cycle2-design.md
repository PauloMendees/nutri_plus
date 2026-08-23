# Tours de produto na web — Ciclo 2 (Agenda, Contabilidade, Alimentos, Configurações) — Design

**Date:** 2026-08-23
**Branch:** `feat/web-onboarding-tours-2` (off `main`)
**Status:** Approved design — ready for implementation plan
**Prereq:** Ciclo 1 mergeado (PR #66) — motor, hub e tour Pacientes em produção.

O ciclo 2 generaliza o motor de tours (hoje amarrado a `'patients'`) e entrega 4 tours novos no mesmo hub `/primeiros-passos`: **Agenda**, **Contabilidade**, **Alimentos** e **Configurações**. Funcionários (tour), Silhueta e Transcrição ficam para o ciclo 3.

---

## Decisions (from brainstorming)

- **Escopo:** Agenda, Contabilidade, Alimentos, Configurações. Nada de tours Pro nem Funcionários neste ciclo.
- **Dados reais onde faz sentido:** Agenda cria um **agendamento-demo** e Contabilidade um **lançamento-demo** (forms reais, com limpeza depois). Alimentos é só navegação (tela read-only). Configurações é só explicação — **nada é salvo**.
- **Vínculo do agendamento-demo:** aponta para o paciente-demo (Maria Demonstração) **se ele existir**; senão cria sem paciente. O tour de Agenda **nunca** depende do tour de Pacientes.
- **Quem inicia:** segue a permissão do módulo. Agenda e Contabilidade: NUTRITIONIST **e** EMPLOYEE. Alimentos (`canBrowseFoods`) e Configurações (`canManageSettings`): só NUTRITIONIST — card visível para EMPLOYEE com CTA desabilitado e texto explicativo, como no ciclo 1.
- **Rastreio das entidades-demo:** colunas FK dedicadas em `OnboardingProgress` (`demoAppointmentId`, `demoTransactionId`), nullable, `onDelete: SetNull` — mesmo padrão do `demoPatientId`.
- **Sem mudanças de comportamento na API de Agenda/Contabilidade:** diferente de pacientes (convite de e-mail), agendamento e transação não têm efeito colateral — o tour submete os forms reais como estão. As entidades-demo são registros normais marcados pelo texto (**Consulta de demonstração** / **Lançamento de demonstração**).
- **Replay nunca cria segunda entidade:** a exceção única do cadastro (ciclo 1) vira regra declarada no catálogo (`createsDemo`) e vale para os passos Salvar de Agenda e Contabilidade.
- **Limpeza:** banner por tour no hub usando os DELETEs já existentes (`useDeleteAppointment`, `useDeleteTransaction`). Sem endpoint novo.

---

## Goal

Done when: o hub `/primeiros-passos` mostra 5 cards de tour (Pacientes + os 4 novos, na ordem do sidebar), cada um com Começar/Continuar/Concluído+Rever e cadeados próprios; funcionário inicia Agenda e Contabilidade mas vê Pacientes/Alimentos/Configurações com CTA desabilitado; o tour de Agenda cria um agendamento-demo real (vinculado ao paciente-demo quando existe) e o de Contabilidade um lançamento-demo real; replay de qualquer capítulo não faz PATCH nem cria segunda entidade; os banners de limpeza apagam as entidades-demo pelos deletes existentes; testes de API e web passam.

---

## 1. Generalização do motor

O motor do ciclo 1 é funcional mas monotour. Este ciclo remove os hardcodes sem mudar comportamento do tour Pacientes.

### shared-types (`packages/shared-types/src/v1/onboarding.ts`)

```ts
export const ONBOARDING_TOUR_IDS = [
  'patients',
  'agenda',
  'contabilidade',
  'alimentos',
  'configuracoes',
] as const;
```

`isOnboardingTourId` continua sendo o único gate da API — adicionar os ids já libera o PATCH. `OnboardingTourProgressView` ganha `demoAppointmentId: string | null` e `demoTransactionId: string | null`; `PatchOnboardingTourRequest` ganha os dois campos opcionais.

### Catálogo (`apps/web/src/lib/onboarding/catalog.ts`)

- `TourDefinition.id: OnboardingTourId` (deixa de ser literal `'patients'`).
- Novos campos em `TourDefinition`:
  - `canStart: (role: UserRole) => boolean`
  - `startLockedText: string` — texto do CTA desabilitado para quem não pode iniciar.
- Registry: `export const ALL_TOURS: TourDefinition[]` na ordem: Pacientes, Agenda, Contabilidade, Alimentos, Configurações (`patients`, `agenda`, `contabilidade`, `alimentos`, `configuracoes`). `getTour(id)` consulta o registry.
- `TourChapter.createsDemo?: 'patient' | 'appointment' | 'transaction'` — substitui os `if (chapterId === 'cadastro')` espalhados. Um capítulo com `createsDemo` tem exatamente um passo de submit (o único passo `click` com `awaitAction` do capítulo — não necessariamente o último passo), e o motor aplica a ele as regras de replay/recovery abaixo.
- `TourRouteCtx` vira `{ demoPatientId?: string; pathname?: string }` — as rotas-função dos novos tours não usam refs (rotas fixas). `resolveRoute` só devolve `null` quando a rota-função exige um ref ausente (comportamento atual, agora restrito ao tour Pacientes).
- `requiresDemo` continua existindo e continua significando "requer paciente-demo" — só o tour Pacientes usa. Nenhum capítulo novo exige entidade-demo.

### TourProvider (`apps/web/src/components/onboarding/tour-provider.tsx`)

- `Session.tourId` e `start({ tourId })` aceitam `OnboardingTourId`; todo PATCH usa `session.tourId` (hoje `mutateRef.current('patients', ...)`).
- O progresso lido passa a ser `onboarding.tours.find(t => t.tourId === session.tourId)`.
- **Gate por tour:** os três bloqueios globais `if (role === EMPLOYEE) return` (em `tryStart`, `hydrateFromSearch`, `TourUrlHydrator`) viram `if (!getTour(tourId)?.canStart(role)) return`.
- `hydrateFromSearch` aceita qualquer id do registry (hoje rejeita `!== 'patients'`).
- **Replay de capítulo `createsDemo`** (generaliza `replayCadastroSubmit`):
  - `patient`: comportamento atual — `preventDefault` no submit e `router.push('/patients/' + demoPatientId)`.
  - `appointment` / `transaction`: `preventDefault` + `stopPropagation` no clique de Salvar, fecha o dialog (dispara `Escape` — Radix Dialog fecha), e avança para o passo seguinte da sessão (ou encerra o capítulo, se o submit era o último passo). Zero PATCH, como todo replay.
- **Recovery de capítulo `createsDemo`** (generaliza `isCadastroPlayRecovery`): só se aplica a tours com pelo menos um capítulo `requiresDemo` (hoje, só Pacientes) — se o capítulo está terminal mas o ref correspondente é `null` (entidade apagada), Rever daquele capítulo roda o submit de verdade e o cliente faz PATCH **apenas** do ponteiro (`demoPatientId`) — status/`completedAt` do capítulo não mudam. Em Agenda/Contabilidade, rever o capítulo `createsDemo` com ponteiro `null` **não** recria a entidade (o intercept de replay se aplica normalmente) — apagar a entidade-demo é decisão do usuário e nada no motor depende dela.
- `isPlayCadastroSubmit()` (API pública do contexto) é renomeado/generalizado para `isPlayDemoSubmit(kind)` mantendo o comportamento para `create-patient-form` (que envia `demo: true`). Agenda/Contabilidade **não** precisam de flag no body — só do id criado.
- `notifyChapterActionSucceeded(payload)` já é genérico; passa a aceitar `{ demoPatientId?, demoAppointmentId?, demoTransactionId? }` e o provider faz o PATCH do ponteiro junto com a conclusão do capítulo (modo play).

### Hub (`apps/web/src/components/onboarding/hub-view.tsx`)

- O card único hardcoded vira `ALL_TOURS.map(tourDef => ...)`: lookup de progresso, `primaryCta`, capítulos, Começar/Continuar/Rever e cadeados **por tour**.
- `canStart = tourDef.canStart(role)`; quando falso, CTA desabilitado + `tourDef.startLockedText`.
- Recovery/cadastro deixam de ser casos especiais no hub: a checagem usa `chapter.createsDemo` + o ref correspondente do progresso.
- **Banners de limpeza por tour** (ver §4).

### First-run

`first-run-host.tsx` e `first-run-dialog.tsx` ficam como estão: começar qualquer tour suprime o convite — semântica correta com N tours. O mockup do dialog continua ilustrando o tour Pacientes (porta de entrada).

---

## 2. Dados e API

### Prisma (migração aditiva)

```prisma
model OnboardingProgress {
  // ...campos atuais...
  demoAppointmentId String?
  demoAppointment   Appointment? @relation(fields: [demoAppointmentId], references: [id], onDelete: SetNull)
  demoTransactionId String?
  demoTransaction   Transaction? @relation(fields: [demoTransactionId], references: [id], onDelete: SetNull)
}
```

`Appointment` e `Transaction` ganham a back-relation `onboardingDemoFor OnboardingProgress[]`. Apagar a entidade pela UI normal zera o ponteiro sozinho (SetNull), igual ao paciente-demo.

### PATCH `/v1/me/onboarding/:tourId`

Corpo ganha `demoAppointmentId?: string | null` e `demoTransactionId?: string | null` (mesma regra do `demoPatientId`: escrever é permitido; SetNull cuida de deletes). GET expõe os dois no `TourProgressView`. Regras monotônicas de capítulo/tour **inalteradas**. `onboarding.types.spec.ts` atualiza a asserção de `ONBOARDING_TOUR_IDS` para os 5 ids.

### Apagar paciente-demo com agendamento vinculado — já coberto

`Appointment.patient` tem `onDelete: Restrict`, mas `PatientsService.deleteDemoPatient` (ciclo 1) já executa `prisma.appointment.deleteMany({ where: { patientId: id } })` na transação antes do delete do user — nenhuma mudança necessária. Se o agendamento apagado era o demo, `OnboardingProgress.demoAppointmentId` zera via SetNull.

### Sem mudanças nos módulos Appointments/Transactions

Creates e deletes existentes atendem tudo. Os creates já devolvem a view da entidade criada (id) — o dialog repassa o id ao motor via `notifyChapterActionSucceeded`.

---

## 3. Os 4 tours — capítulos, âncoras e fixtures

Hoje não existe nenhum `data-tour` fora de `components/patients/`. Todos os anchors abaixo são novos. Padrão do ciclo 1: passos `click` em botões reais (clique nativo segue), `next` para explicação, fixture preenche mas nunca submete, `awaitAction` nos cliques que gravam.

### Tour `agenda` — título **Agenda**, resumo **Agendamentos, visões de mês e lista, e categorias.**

`canStart`: NUTRITIONIST e EMPLOYEE (sempre `true`). 3 capítulos:

| # | `chapterId` | Rota | Passos | Fixture |
|---|---|---|---|---|
| 1 | `visao-geral` | `/agenda` | `next` `[data-tour="agenda.view"]` (o que é a agenda) · `next` `[data-tour="agenda.toggle"]` (Mês/Lista) · `next` `[data-tour="agenda.nav"]` (mês anterior/próximo/Hoje) | — |
| 2 | `agendamento` | `/agenda` | `click` `[data-tour="agenda.new"]` (abre `AppointmentDialog`) · `next` `[data-tour="agenda.form"]` (categoria auto-preenche título; paciente opcional) · `click` `[data-tour="agenda.save"]` `awaitAction` | `appointment` |
| 3 | `categorias` | `/agenda/categorias` | `next` `[data-tour="agenda.categories"]` (lista, badge Padrão) · `click` `[data-tour="agenda.category.new"]` (abre `CategoryDialog`) · `next` `[data-tour="agenda.category.form"]` (cores, marcar como padrão) · `click` `[data-tour="agenda.category.cancel"]` (fecha **sem salvar**) | — |

`agendamento` tem `createsDemo: 'appointment'`. Fixture `appointment` (registrada no `AppointmentDialog` quando aberto): título **Consulta de demonstração**, categoria = a padrão ou a primeira da lista (se houver), paciente = paciente-demo **se** `demoPatientId` do tour `patients` existir (senão sem paciente), data = amanhã, 09:00–10:00 (evita horário no passado, virada de meia-noite e conflito 409), descrição `Criado pelo tour de primeiros passos.`. Ao criar com sucesso, o dialog chama `notifyChapterActionSucceeded({ demoAppointmentId: created.id })`.

### Tour `contabilidade` — título **Contabilidade**, resumo **Extrato mensal, lançamentos e categorias financeiras.**

`canStart`: NUTRITIONIST e EMPLOYEE. 3 capítulos:

| # | `chapterId` | Rota | Passos | Fixture |
|---|---|---|---|---|
| 1 | `extrato` | `/contabilidade` | `next` `[data-tour="contabilidade.view"]` (extrato do mês) · `next` `[data-tour="contabilidade.chart"]` (Entradas x Saídas, 12 meses) · `next` `[data-tour="contabilidade.cards"]` (Entradas/Saídas/Saldo) · `next` `[data-tour="contabilidade.nav"]` (troca de mês) | — |
| 2 | `lancamento` | `/contabilidade` | `click` `[data-tour="contabilidade.new"]` (abre `TransactionDialog`) · `next` `[data-tour="contabilidade.form"]` (tipo filtra categorias; valor em R$) · `click` `[data-tour="contabilidade.save"]` `awaitAction` · `next` `[data-tour="contabilidade.table"]` (lançamento no extrato; clicar na linha edita) | `transaction` |
| 3 | `categorias` | `/contabilidade/categorias` | `next` `[data-tour="contabilidade.categories"]` (Receita vs Despesa) · `click` `[data-tour="contabilidade.category.new"]` (abre dialog) · `next` `[data-tour="contabilidade.category.form"]` (nome e tipo) · `click` `[data-tour="contabilidade.category.cancel"]` (fecha **sem salvar**) | — |

`lancamento` tem `createsDemo: 'transaction'`. Fixture `transaction` (registrada no `TransactionDialog`): tipo Receita, valor `100`, data hoje, categoria = primeira de Receita (se houver), descrição **Lançamento de demonstração**. Sucesso → `notifyChapterActionSucceeded({ demoTransactionId: created.id })`.

### Tour `alimentos` — título **Alimentos**, resumo **Busca na tabela TACO com dados nutricionais.**

`canStart`: `canBrowseFoods` (só NUTRITIONIST). `startLockedText`: `Este tutorial é feito pelo nutricionista (busca de alimentos).` 1 capítulo:

| # | `chapterId` | Rota | Passos | Fixture |
|---|---|---|---|---|
| 1 | `busca` | `/alimentos` | `next` `[data-tour="alimentos.search"]` (tabela TACO; mínimo 2 letras) com fixture · `next` `[data-tour="alimentos.table"]` (valores por 100 g: kcal, macros, fibra, sódio) | `foods-search` |

Fixture `foods-search`: preenche a busca com `arroz`. O input usa `useState` (não RHF) — a fixture é registrada dentro do próprio `FoodsBrowse` e chama o setter do estado (`setSearch('arroz')`). Sem a fixture, o usuário digita; o passo 2 só resolve quando a tabela renderiza (polling de âncora existente cobre).

### Tour `configuracoes` — título **Configurações**, resumo **Plano alimentar, aparência, aplicativo do paciente e assinatura.**

`canStart`: `canManageSettings` (só NUTRITIONIST). `startLockedText`: `Este tutorial é feito pelo nutricionista (configurações da conta).` **Nada é salvo em nenhum passo.** 4 capítulos = as 4 tabs (`defaultValue="plano"`):

| # | `chapterId` | Rota | Passos |
|---|---|---|---|
| 1 | `plano-alimentar` | `/configuracoes` | `next` `[data-tour="config.tabs"]` (as 4 áreas) · `next` `[data-tour="config.plano"]` (logo do PDF, nome de exibição, instruções padrão da IA — sem salvar) |
| 2 | `aparencia` | `/configuracoes` | `click` `[data-tour="config.tab.aparencia"]` · `next` `[data-tour="config.aparencia"]` (tema claro/escuro) |
| 3 | `aplicativo` | `/configuracoes` | `click` `[data-tour="config.tab.app"]` · `next` `[data-tour="config.app"]` (WhatsApp de contato, permissões do app do paciente) |
| 4 | `assinatura` | `/configuracoes` | `click` `[data-tour="config.tab.assinatura"]` · `next` `[data-tour="config.assinatura"]` (plano, forma de pagamento, faturas) |

Atenção de implementação: `settings-view.tsx` é um único `<form>` RHF com **dois** botões submit (tabs `plano` e `app`) — os anchors de conteúdo (`config.plano`, `config.app`) ficam em wrappers das tabs, nunca nos submits, para o tour não induzir salvamento.

Textos de passo: pt-BR, título + 1–2 frases, escritos na implementação seguindo o tom do ciclo 1.

---

## 4. Limpeza das entidades-demo

O `DeleteDemoBanner` (hoje específico de paciente) generaliza para um banner por tour no hub, dirigido pelos refs do progresso:

| Tour | Condição | Botão (2 cliques: confirmar) | Ação |
|---|---|---|---|
| `patients` | `demoPatientId` set | **Apagar paciente de demonstração** (atual) | `useDeleteDemoPatient` (atual) |
| `agenda` | `demoAppointmentId` set | **Apagar agendamento de demonstração** | `useDeleteAppointment` existente |
| `contabilidade` | `demoTransactionId` set | **Apagar lançamento de demonstração** | `useDeleteTransaction` existente |

Após sucesso, invalidar a query de onboarding além das do módulo (o ponteiro no GET seguinte vem `null` via SetNull). Copy do banner segue o padrão atual: `Este é um agendamento de demonstração.` / `Este é um lançamento de demonstração.`

Apagar a entidade pela UI normal do módulo (botão Excluir dos dialogs) também zera o ponteiro — o banner some sozinho.

---

## 5. Errors and limits

| Situação | Comportamento |
|---|---|
| Âncora ausente 5s | Igual ciclo 1: tooltip "Não encontrei este passo" + hub; capítulo não completa |
| Replay de `agendamento`/`lancamento` com entidade viva | Submit interceptado; dialog fecha via Escape; zero PATCH |
| Rever capítulo `createsDemo` com ponteiro null | Pacientes (cadastro): submit real acontece; PATCH só do ponteiro; status do capítulo não muda. Agenda/Contabilidade: não recria — replay intercepta o submit normalmente |
| Create de agendamento/transação 4xx/5xx | Toast atual do dialog; passo Salvar não avança (`awaitAction`) |
| Apagar paciente-demo com agendamento-demo vinculado | Já coberto pelo ciclo 1: `deleteDemoPatient` apaga agendamentos vinculados na transação |
| Funcionário abre tour de Alimentos/Configurações por URL | `canStart` falso → redireciona ao hub `/primeiros-passos` (onde o card aparece bloqueado com a explicação) |
| Conta read-only (402) | Tratamento existente do motor; PATCHes falham com toast e Sair |
| Fixture de categoria sem nenhuma categoria cadastrada | Fixture deixa o campo vazio (categoria é opcional no agendamento; na transação o usuário escolhe/cria — o passo `next` do form orienta) |

Fora deste ciclo: tour Funcionários, Silhueta, Transcrição; cards "em breve"; analytics; reset de progresso; qualquer mudança em RBAC ou no `OnboardingGate` de billing.

---

## 6. Testing

**API (Jest)**

- `onboarding.types.spec.ts`: `ONBOARDING_TOUR_IDS` = os 5 ids, na ordem.
- `onboarding.service.spec.ts`: PATCH grava `demoAppointmentId`/`demoTransactionId`; view expõe ambos; regras monotônicas continuam verdes; `tourId: 'agenda'` aceito, desconhecido continua 400.

**Web (Vitest)**

- Catálogo: `ALL_TOURS` com 5 tours na ordem; ids/capítulos exatos por tour; `canStart` por papel (EMPLOYEE: agenda/contabilidade `true`, demais `false`); `createsDemo` nos capítulos certos.
- Provider: `start({ tourId: 'agenda' })` PATCHa `'agenda'`; replay de passo `createsDemo` não submete e não PATCHa; recovery com ponteiro null PATCHa só o ponteiro; EMPLOYEE consegue iniciar agenda mas não configuracoes (via URL também).
- Hub: 5 cards; CTAs independentes por tour; EMPLOYEE vê locked text em Pacientes/Alimentos/Configurações; banners de limpeza por ref.
- Fixtures: `appointment` e `transaction` preenchem os dialogs (RHF) sem submeter; `foods-search` dispara busca.
- Smoke `data-tour`: uma asserção por componente tocado nos testes existentes (agenda-view, appointment-dialog, category-dialog, accounting-view, transaction-dialog, transaction-category-dialog, foods-browse, settings-view).

Sem Playwright/E2E neste ciclo.

---

## 7. Files (expected)

**shared-types:** `onboarding.ts` (ids + campos novos nas views/patch).

**API:** migração Prisma (2 colunas FK + back-relations); `onboarding.service.ts` (mapeamento dos refs novos); `dto/patch-tour.dto.ts`.

**Web — motor:** `lib/onboarding/catalog.ts` (registry, `canStart`, `createsDemo`, 4 tours novos), `progress.ts` (recovery genérico por `createsDemo`), `components/onboarding/tour-provider.tsx` (generalização), `hub-view.tsx` (N cards + banners), `delete-demo-banner.tsx` (genérico).

**Web — âncoras/fixtures:** `components/agenda/agenda-view.tsx`, `appointment-dialog.tsx`, `categories-view.tsx`, `category-dialog.tsx`; `components/accounting/accounting-view.tsx`, `transaction-dialog.tsx`, `transaction-categories-view.tsx`, `transaction-category-dialog.tsx`; `components/foods/foods-browse.tsx`; `components/settings/settings-view.tsx`.

---

## Out of scope (ciclo 2)

- Tours Funcionários, Silhueta, Transcrição (ciclo 3).
- Cards "em breve" no hub.
- Novos endpoints de delete ou flags `demo` em Appointments/Transactions.
- Seed de dados além do agendamento-demo e lançamento-demo.
- Voltar passo, analytics, reset de progresso.
- Mudanças em RBAC, `OnboardingGate` de billing ou no first-run dialog.
