# Tours de produto na web (Primeiros passos) — Design

**Date:** 2026-08-21
**Branch:** `feat/web-onboarding-tours` (off `main`)
**Status:** Approved design — ready for implementation plan

Tutorial guiado na aplicação web para o nutricionista conhecer os módulos. Este ciclo entrega o **motor**, o **hub** e o tour **Pacientes** (com capítulos). Agenda, Contabilidade, Alimentos, Configurações, Silhueta, Transcrição e Funcionários ficam para ciclos seguintes, no mesmo motor.

Isto **não** substitui o onboarding de plano (`OnboardingGate` → `/assinatura` quando `onboardedAt == null`). São fluxos distintos: primeiro a conta escolhe plano; depois o tutorial de produto.

---

## Decisions (from brainstorming)

- **Ciclo 1:** motor + hub + tour Pacientes. Outros módulos omitidos no hub (não mostrar card “em breve”).
- **Motor:** lib de spotlight (`driver.js` ou equivalente) só para holofote/tooltip; catálogo, rotas, clique-para-avançar, fixtures, progresso e gating são nossos.
- **Dados reais:** o tour submete formulários de verdade. Paciente-demo **não envia convite** (o create atual sempre chama `inviteUser`).
- **Replay:** capítulo concluído pode ser revisto à vontade. Sessão `replay` **não** PATCH. `COMPLETED` / `SKIPPED` / `completedAt` nunca recuam.
- **Avanço:** clique no elemento destacado (o clique nativo ocorre). Passos só-informativos usam **Próximo**. Sem voltar passo neste ciclo.
- **Entrada:** item **Primeiros passos** no sidebar + modal opcional no 1º acesso ao `(app)` depois do gate de plano. Recusar não inicia o tour.
- **Quem vê o hub:** nutricionista e funcionário. O tour `patients` **só o nutricionista inicia** — `canManagePatients` hoje é `NUTRITIONIST` only; funcionário é leitura na ficha e não consegue os passos de cadastro/salvar. Card visível para EMPLOYEE, CTA desabilitado com essa explicação.
- **IA:** capítulo separado no mesmo tour, cadeado se `isReadOnly` ou cota de IA esgotada. Com permissão, gasta **1 ação** de verdade; o tooltip avisa antes do clique que gera.
- **Diário:** no capítulo Recordatório e diário, a aba Diário é só explicação (`next`). Sem seed de `MealLog`.
- **Silhueta e transcrição:** fora deste ciclo (tours Pro futuros).

---

## Goal

Done when: nutricionista (plano já escolhido) vê **Primeiros passos** no menu e, no 1º acesso sem tour começado, um convite opcional; no hub inicia, pausa, continua e **reveja** o tour Pacientes sem perder progresso; o cadastro demo cria um paciente real sem e-mail de convite; capítulos 3–9 usam essa ficha; o capítulo de IA aparece cadeado sem cota/plano e, com permissão, gera um rascunho; funcionário vê o hub mas não dispara Pacientes; testes de API (progresso monotônico, demo create) e de web (motor, hub, replay sem PATCH) passam.

---

## 1. Architecture

Three pieces, all inside the existing web dashboard (`(app)`) and the Nest API.

```
Hub /primeiros-passos
        │  GET /v1/me/onboarding
        ▼
 TourProvider (session: play | replay)
        │  click / next / skip / exit
        ▼
 driver.js spotlight  +  catalog.ts (routes, data-tour, fixtures)
        │  PATCH only if mode=play
        ▼
 OnboardingProgress (per userId + tourId)
```

- **`TourProvider`** no layout `(app)`: sessão em memória + query (`?tour=patients&chapter=cadastro` e `&replay=1` para F5). Não persiste replay.
- **Catálogo** só no frontend (`apps/web/src/lib/onboarding/catalog.ts`). A API guarda progresso opaco (`tourId`, `chapterId`, `furthestStepId` string).
- **Gating** no cliente, com `useSubscription().entitlements` já existente. O motor recusa `start` de capítulo `locked`.
- **Âncoras:** `data-tour="patients.new"` etc. nos componentes reais. Sem UI paralela.

`OnboardingGate` de billing permanece intocado e roda **antes** do convite de tutorial (conta sem plano nunca vê o hub).

---

## 2. Hub, nav, 1º acesso

**Rota:** `/primeiros-passos` (`apps/web/src/app/(app)/primeiros-passos/page.tsx`). Papel: NUTRITIONIST e EMPLOYEE (o layout `(app)` já exclui PATIENT).

**Sidebar:** novo item no `NAV_ITEMS`, label **Primeiros passos**, href `/primeiros-passos`, ícone `GraduationCap`, sem `canAccess` (ambos os papéis do dashboard). Não é filho de outro módulo.

**Card do tour Pacientes:**

- Título, resumo, lista de 9 capítulos com estado: a fazer · em andamento · concluído · pulado · cadeado.
- CTA principal olha só o progresso **persistido**:
  - sem linha / `NOT_STARTED` → **Começar** (NUTRITIONIST). EMPLOYEE: botão desabilitado, texto “Este tutorial é feito pelo nutricionista (cadastro de pacientes).”
  - `IN_PROGRESS` → **Continuar** (primeiro capítulo não terminal, na ordem do catálogo).
  - `COMPLETED` → selo **Concluído** + **Rever** (replay do primeiro capítulo, ou do tour inteiro percorrendo só capítulos já COMPLETED/SKIPPED; cadeados continuam cadeados).
- Cada capítulo concluído ou pulado tem **Rever**. Replay = `mode: replay`, zero PATCH.
- Capítulo `gerar-ia` sem permissão: cadeado + CTA `/assinatura` (ou texto de cota se `AI_QUOTA_EXCEEDED` implícito: `aiUsed >= aiQuota`). Nem Começar nem Rever.

**Continuar vs replay.** Continuar retoma o primeiro capítulo cujo status persistido não é COMPLETED nem SKIPPED. Rever não altera essa regra.

**Paciente-demo no replay.** Se `demoPatientId` aponta para um paciente existente, o passo Salvar do cadastro **não cria outro** — navega para a ficha já ligada. Se o paciente foi apagado, o Cadastro em `play` (Continuar nesse capítulo, ou Cadastro ainda não terminal) cria de novo e atualiza o ponteiro; replay de capítulos 3–9 sem demo aborta para o hub com “Cadastre o paciente de demonstração de novo”.

**1º acesso.** Depois de `onboardedAt` preenchido, na primeira pintura do `(app)` se `promptDismissedAt == null` e nenhum tour `IN_PROGRESS`/`COMPLETED`: diálogo “Conheça o iNutri” → **Ver primeiros passos** (navega) ou **Agora não** (PATCH `promptDismissedAt`). Não auto-inicia Pacientes. Já ter progresso de tour também suprime o modal (e o GET pode devolver `promptDismissedAt` ainda null — o cliente trata “já começou” como dismissed visual; o PATCH de dismiss não é obrigatório nesse caso).

**Fim do tour.** Ao completar Pacientes (ou no hub quando `COMPLETED` e `demoPatientId` existe): convite **Apagar paciente de demonstração**, usando o delete de paciente já existente. Sucesso zera o ponteiro no GET seguinte. Não desfaz plano/avaliação/anamnese avulsos além do cascade do paciente.

---

## 3. Tour engine

**Sessão:** `{ tourId, chapterId, stepId, mode: 'play' | 'replay' }`.

**Passo no catálogo:**

| Campo | Uso |
|---|---|
| `id` | estável; vira `furthestStepId` |
| `route` | string ou `(ctx) => string` com `demoPatientId` |
| `anchor` | `[data-tour="..."]` |
| `title`, `body` | pt-BR, 1–2 frases |
| `advance` | `click` (padrão) ou `next` |
| `fixture` | chave opcional no registry |
| `requiresFeature` | só no **capítulo** |

Tooltip: texto + **Pular capítulo** + **Sair** + **Preencher com dados fictícios** se `fixture` + **Próximo** se `advance: next`. Sem botão voltar passo.

**Clique:** listener em capture no âncora; o evento nativo segue (navegação, submit, abrir dialog). Depois avança. Se o próximo passo tem outra `route`, `router.push` se ainda não estamos lá, e espera o âncora (MutationObserver, timeout 5s). Timeout → “Não encontrei este passo” + **Voltar ao hub**; capítulo **não** vira COMPLETED.

**Pular capítulo (`play`):** status `SKIPPED`, `completedAt` agora, sessão vai ao próximo capítulo liberado ou ao hub. `SKIPPED` não sobrescreve `COMPLETED`. Em `replay`, pular só avança a sessão.

**Sair:** destrói a sessão, tira query string; progresso persistido intacto.

**Fixture:** `Record<string, (ctx) => void>`. Preenche react-hook-form (`reset` / `setValue`); **não** chama submit. O nutri ainda clica Salvar (passo `click` no botão).

**Mobile:** se o âncora está na sidebar fechada, o motor abre o sheet antes do holofote. Sem layout extra.

**Lib:** `driver.js` (MIT) configurado sem steps internos, sem overlay-click-to-close que avance sozinho. Estilo do tooltip alinhado aos tokens iNutri (verde, rounded). Troca da lib não vaza para o catálogo.

---

## 4. Data model and API

Migração aditiva, convenções Prisma do repo (camelCase, `@default(uuid())`).

### `User`

```prisma
onboardingPromptDismissedAt DateTime?
onboardingProgress          OnboardingProgress[]
```

Hub-level, por usuário (nutri e funcionário). Não vive em `OnboardingProgress` (isso é por tour).

### Progresso

```prisma
enum OnboardingTourStatus {
  IN_PROGRESS
  COMPLETED
}

enum OnboardingChapterStatus {
  IN_PROGRESS
  COMPLETED
  SKIPPED
}

model OnboardingProgress {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tourId        String
  status        OnboardingTourStatus @default(IN_PROGRESS)
  demoPatientId String?
  demoPatient   PatientProfile? @relation(fields: [demoPatientId], references: [id], onDelete: SetNull)
  completedAt   DateTime?
  chapters      OnboardingChapterProgress[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([userId, tourId])
  @@index([userId])
}

model OnboardingChapterProgress {
  id             String                   @id @default(uuid())
  progressId     String
  progress       OnboardingProgress       @relation(fields: [progressId], references: [id], onDelete: Cascade)
  chapterId      String
  status         OnboardingChapterStatus
  furthestStepId String?
  completedAt    DateTime?
  @@unique([progressId, chapterId])
}
```

`PatientProfile` ganha a back-relation opcional `onboardingDemoFor OnboardingProgress[]`. Sem coluna `isDemo` no paciente: o DTO deriva `isDemo` de `user.authProvider === 'demo'` e **não** expõe `authProvider` ao cliente.

Não existe status `NOT_STARTED` no banco: ausência de linha = não começou. Não existe endpoint de reset.

### Regras de escrita (`play` only — o servidor não distingue replay; o cliente não chama)

- Capítulo `COMPLETED` ou `SKIPPED`: PATCH idêntico (mesmo status) é 200 idempotente. PATCH que **mude** `status`, `furthestStepId` ou `completedAt` desse capítulo → **400**. Terminal é imutável.
- `OnboardingProgress.status = COMPLETED` não volta para `IN_PROGRESS`.
- `completedAt` do capítulo e do tour só se preenchem uma vez.
- `furthestStepId` enquanto o capítulo está `IN_PROGRESS`: last-write; o cliente só envia para frente. O servidor **não** replica a ordem do catálogo.
- `demoPatientId` atualiza se o ponteiro atual é null ou o paciente foi apagado (`onDelete: SetNull`). Não aponta para paciente de outra clínica (404/403 no create/GET).
- Completar o tour: quando, no PATCH, todos os capítulos **não cadeados** do catálogo conhecido pelo **cliente** estão COMPLETED ou SKIPPED, o cliente manda `tourStatus: COMPLETED`. O servidor aceita essa transição uma vez. Capítulos que o cliente nunca reportou não existem no banco — o cliente envia COMPLETED do tour só depois de percorrer o conjunto liberado. Servidor **não** calcula cadeado de IA (não duplica o catálogo); confia no cliente para o flip do tour, e mesmo assim não reabre um tour COMPLETED.

### Endpoints

Auth: `NUTRITIONIST` | `EMPLOYEE`. Billing: leitura sempre; PATCH é escrita e respeita `SubscriptionGuard` (conta read-only → 402 `READ_ONLY`, igual ao resto do app).

| Método | Rota | Corpo / resposta |
|---|---|---|
| `GET` | `/v1/me/onboarding` | `{ promptDismissedAt: string \| null, tours: TourProgressView[] }` |
| `PATCH` | `/v1/me/onboarding` | `{ promptDismissed: true }` → atualiza `User.onboardingPromptDismissedAt` se ainda null |
| `PATCH` | `/v1/me/onboarding/:tourId` | ver abaixo |
| `POST` | `/v1/patients` | `demo?: boolean` adicional no DTO de create |

`TourProgressView`:

```ts
{
  tourId: string
  status: 'IN_PROGRESS' | 'COMPLETED'
  demoPatientId: string | null  // null se nunca houve ou paciente apagado
  completedAt: string | null
  chapters: {
    chapterId: string
    status: 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'
    furthestStepId: string | null
    completedAt: string | null
  }[]
}
```

`PATCH /v1/me/onboarding/:tourId`:

```ts
{
  chapterId?: string
  chapterStatus?: 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'
  furthestStepId?: string
  demoPatientId?: string | null
  tourStatus?: 'COMPLETED'
}
```

Upsert da linha de tour na primeira escrita. `tourId` desconhecido (não `patients` neste ciclo) → 400. EMPLOYEE pode PATCH prompt e ler; PATCH de `patients` com capítulos é permitido tecnicamente, mas o hub não inicia o tour — YAGNI no servidor (não checar role além do guard). Create `demo: true` continua `canManagePatients` / role NUTRITIONIST no `PatientsController` atual.

### Paciente-demo

`POST /v1/patients` com `demo: true` (NUTRITIONIST):

1. Ignora `UNDELIVERABLE_EMAIL`.
2. **Não** chama `inviteUser` / `deleteUser`.
3. Cria `User` com `authProvider: 'demo'`, `authProviderId: <uuid>`. E-mail = o do DTO (a fixture manda `demo.{userIdShort}.{n}@demo.local`, único). Unique de e-mail → 409 como hoje. Sem convite, `@demo.local` é aceitável; o check `UNDELIVERABLE_EMAIL` só se aplica ao caminho com convite.
4. `canLogAssessments: false`, `showMealTargetToPatient: false` (demo não usa o app).
5. Nome vem do DTO (fixture: **Maria Demonstração**).
6. Upsert `OnboardingProgress` (`userId` do nutri, `tourId: 'patients'`) com `demoPatientId`.
7. Resposta do paciente inclui `isDemo: true`. Lista e detalhe também.

Sem `demo: true`: comportamento atual (convite, rejeita `@example.com` / `@invalid` / etc.).

Selo **Demo** na lista e no header da ficha quando `isDemo`.

Delete: endpoint de paciente existente; cascade apaga logs/planos; `demoPatientId` vira null via `onDelete: SetNull`.

---

## 5. Tour `patients` — capítulos

`tourId: 'patients'`. Contexto: `demoPatientId` obrigatório a partir do capítulo 3. Sem demo, o hub não oferece Continuar/Rever nesses capítulos — pede o Cadastro.

Silhueta (aba Pro) e transcrição (gravador na aba Anamnese) **não** têm capítulo. Tours futuros.

| # | `chapterId` | Rota | Passos (resumo) | Fixture |
|---|---|---|---|---|
| 1 | `lista` | `/patients` | Explica a lista/busca (`next`); clique em **+ Novo paciente** | — |
| 2 | `cadastro` | `/patients/new` | Explica o form (`next`); fixture; clique **Salvar** | `create-patient` |
| 3 | `ficha` | `/patients/:id` aba Dados | Header (foto, IMC, LGPD) `next`; campos clínicos; fixture opcional; clique salvar se houver | `edit-patient` |
| 4 | `anamnese` | aba Anamnese | Para que serve (`next`); fixture; salvar | `anamnese` |
| 5 | `bioimpedancia` | aba Bioimpedância | Nova avaliação; fixture de uma medida; menção a **Exportar evolução** (`next`) | `assessment` |
| 6 | `metas` | aba Metas | Explica calculadoras/alvos (`next`); interação mínima com o UI existente | opcional |
| 7 | `recordatorio-diario` | abas Recordatório e Diário | Recordatório: fixture curta + salvar. Diário: `next` sobre histórico vindo do app, filtros 30/90/Tudo — **sem gerar `MealLog`** | `food-recall` |
| 8 | `plano-manual` | Planos → `/patients/:id/planos/novo` | Clique **Novo plano**; explica refeições/TACO (`next`); fixture de plano mínimo; salvar; **Exportar PDF** no plano já salvo | `meal-plan` |
| 9 | `gerar-ia` | aba Planos | Clique **Gerar com IA**; aviso de 1 cota; instrução fictícia; confirma geração; aterrissa no rascunho | `ai-instructions` |

**Permissão do capítulo 9:** `!entitlements.isReadOnly && entitlements.aiUsed < entitlements.aiQuota`. Sem isso, cadeado. 402 no generate: toast, não COMPLETED.

**Pular `cadastro`:** não cria demo; capítulos 3–9 indisponíveis. Pular `gerar-ia`: `SKIPPED`; o tour pode COMPLETED.

**Replay do cadastro com demo vivo:** o clique em Salvar, se o form submetesse de novo, criaria segundo paciente. No modo replay o passo Salvar **não submete**: o motor intercepta, faz `preventDefault` só nesse passo, e `push` para `/patients/:demoId`. (Exceção única ao “clique nativo sempre ocorre”.)

**Apagar demo** não reseta capítulos.

Textos: título + corpo curto, pt-BR, sem tour do menu.

---

## 6. Errors and limits

| Situação | Comportamento |
|---|---|
| Âncora ausente 5s | Tooltip + hub; capítulo não completa |
| Demo apagado no meio de 3–9 | Hub pede Cadastro de novo; ponteiro null no GET |
| Create demo 409/402/5xx | Toast atual; não avança o passo Salvar |
| Conta vira read-only no meio | 402 no próximo PATCH/write; Sair; BillingGate já existente |
| Generate IA 5xx | Toast; fica no dialog; capítulo não completa |
| Dois dispositivos em `play` | PATCH monotônico; terminal não recua |
| Funcionário abre `/primeiros-passos` | Vê o card; não inicia |
| Sair com form sujo | Descarta; progresso intacto |
| Query `replay=1` com capítulo nunca feito | Ignora replay, trata como play/continuar se aplicável, senão hub |

Fora deste ciclo: desfazer entidades criadas além do delete do demo; analytics; reset de progresso; seed de diário.

---

## 7. Testing

**API (Jest)**

- Create `demo: true`: não chama `inviteUser`; `authProvider = demo`; `isDemo` na resposta; upsert progresso com `demoPatientId`. Sem flag: convite e rejeição de e-mail undeliverable intactos.
- PATCH capítulo: IN_PROGRESS → COMPLETED; segundo PATCH tentando IN_PROGRESS no mesmo capítulo falha/no-op.
- SKIPPED não sobrescreve COMPLETED.
- `tourStatus: COMPLETED` uma vez; segundo PATCH não reabre.
- `promptDismissed` só preenche se null.
- GET: paciente demo apagado → `demoPatientId: null`.
- EMPLOYEE GET 200; POST demo 403 (role patients).

**Web (Vitest)**

- Motor: click avança; `next` só pelo botão; troca de rota espera âncora; timeout → hub sem complete; fixture não submit; `replay` zero PATCH; pular → SKIPPED em play; Sair não persiste sessão.
- Hub: Começar / Continuar / Concluído+Rever; IA cadeada; modal 1º acesso uma vez; “Agora não”; EMPLOYEE sem CTA de começar.
- Catálogo: 9 capítulos; 3–9 exigem demo; cadastro pulado bloqueia o resto.
- Smoke: `data-tour` presente nos botões âncora dos testes de componente já existentes (lista, create, meal-plans **Gerar com IA** / **Novo plano**).

Sem teste de pixel do driver.js. Sem E2E Playwright neste ciclo.

---

## 8. Files (expected)

**API:** `onboarding` module (controller + service + specs); migração Prisma; `CreatePatientDto.demo`; ramo em `PatientsService.createPatient`; `isDemo` nos mappers de patient; `shared-types` (`TourProgressView`, patch DTOs, `demo?` no create).

**Web:** `lib/onboarding/catalog.ts`, `fixtures.ts`, `engine` (`TourProvider`, hook `useTour`); `components/onboarding/*` (hub, tooltip wrapper, first-run dialog); rota `primeiros-passos`; `data-tour` nos componentes âncora; item em `nav-items.ts`; query `lib/queries/onboarding.ts`.

---

## Out of scope (ciclo 1)

- Tours Agenda, Contabilidade, Alimentos, Configurações, Funcionários, Silhueta, Transcrição.
- Cards “em breve” no hub.
- Sandbox / dados que não persistem.
- Seed de diário alimentar.
- Tour para EMPLOYEE em pacientes (view-only).
- Voltar passo, analytics, reset de progresso, SaaS tipo Appcues.
- Mudar `canManagePatients` / RBAC.
- Alterar `OnboardingGate` de assinatura.
