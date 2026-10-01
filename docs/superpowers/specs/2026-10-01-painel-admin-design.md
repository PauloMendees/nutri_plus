# Painel de administradores (oculto)

**Data:** 2026-10-01 · **Status:** aguardando revisão · **Branch:** `feat/painel-admin`

## Objetivo

Uma página `/admin`, sem nenhum link no app, que só administradores conseguem
abrir — hoje apenas `paulo.h.mendes25@gmail.com`. Ela mostra, **somente para
leitura**, duas abas:

- **Nutricionistas:** tabela com nome, e-mail, telefone, confirmou a conta
  (Sim/Não), quantidade de pacientes e plano ativo; filtros, paginação, detalhe
  da nutricionista com os pacientes dela e download de um PDF da listagem com os
  filtros ativos e **sem** paginação.
- **Pacientes:** tabela de todos os pacientes com busca e paginação.

**Fora do escopo:** qualquer ação que altere dados (editar, excluir, conceder
plano); ficha clínica do paciente no painel; tela de gestão de admins;
exportação da aba Pacientes.

## Acesso

- **Quem é admin:** env da API `ADMIN_EMAILS` (lista separada por vírgula,
  comparação sem diferenciar maiúsculas e espaços). Ausente ou vazia ⇒ ninguém
  é admin. Valor inicial: `paulo.h.mendes25@gmail.com`.
- **API:** decorator `@AdminOnly()` + `AdminGuard`. Admin = usuário autenticado
  cujo `email` está em `ADMIN_EMAILS`, qualquer `role`. Logado e não admin ⇒
  **404** (`NotFoundException`), nunca 403, para não revelar que a rota existe.
  Sem login ⇒ **401** do `SupabaseAuthGuard` global, como qualquer rota da API
  (não revela nada). O `AdminGuard` roda depois dele (precisa do `AuthContext`).
- **Cobrança:** as rotas são só `GET`, então o `SubscriptionGuard` já as deixa
  passar mesmo para tenant em só leitura. As rotas de admin levam
  `@BillingExempt()` mesmo assim, para não depender disso.
- **Web:** `GET /auth/me` passa a devolver `isAdmin: boolean` (mesma regra, na
  API). A página `/admin` e a de detalhe chamam `notFound()` quando `isAdmin` é
  falso. Nenhum item novo na sidebar, no menu ou em qualquer outro lugar.

## Fonte dos dados

### Nutricionistas (junção Supabase Auth + banco)

A nutricionista só vira linha no banco (`User` + `NutritionistProfile`) no
`sync-user` do callback, depois de confirmar o e-mail. Quem se cadastrou e não
confirmou — ou confirmou mas nunca chegou ao `sync-user` (ex.: abandonou o
primeiro login) — existe **só no Supabase Auth**.

- **Banco:** todas as `NutritionistProfile` com `user` (nome, e-mail,
  `createdAt`), `whatsappNumber`, `subscription` e a contagem de pacientes
  **reais** (`isDemo = false`).
- **Supabase Auth:** todos os usuários via `auth.admin.listUsers`, paginando até
  o fim (`perPage` 1000). Um usuário vira linha "só no Auth" (`authOnlyRows`)
  quando: `invited_at` é nulo (convidados — pacientes e funcionários — ficam de
  fora) **e** não existe `User` local com o mesmo `authProviderId` **e** tem
  e-mail. Confirmado ou não: `confirmed` reflete `email_confirmed_at`. Nome e
  telefone vêm de `user_metadata.name` / `user_metadata.whatsapp`; cadastro em
  `created_at`.
- **Junção:** linhas do banco (`confirmed: true`) + linhas só no Auth
  (`confirmed` = e-mail confirmado, 0 pacientes, plano "Sem plano", sem `id` de
  perfil — não abrem detalhe).
- **Escala:** a junção, os filtros, a ordenação e a paginação são feitos em
  memória. Adequado para centenas a poucos milhares de contas; acima disso, o
  caminho é guardar o cadastro no banco no signup (fora do escopo).
- **Falha do Supabase:** se `listUsers` falhar, o endpoint responde **502** com
  a mensagem "Não foi possível consultar o Supabase Auth." — melhor do que uma
  lista que esconde quem não confirmou.

### Plano ativo (rótulo)

Mesma lógica de `EntitlementsService.resolveAccess`, exposta como rótulo:

| Valor | Rótulo | Quando |
|---|---|---|
| `COMP` | Cortesia | `isComp` |
| `PRO` | Pro | `ACTIVE`, `currentPeriodEnd` no futuro, `plan = PRO` |
| `ESSENCIAL` | Essencial | `ACTIVE`, `currentPeriodEnd` no futuro, `plan` `ESSENCIAL` ou nulo |
| `TRIAL` | Teste grátis | `TRIALING`, `trialEndsAt` no futuro |
| `EXPIRED` | Vencida | nenhum dos casos acima e `currentPeriodEnd` preenchido (já foi assinante pago; o período acabou ou deixou de pagar) |
| `TRIAL_ENDED` | Teste encerrado | nenhum dos casos acima, sem período pago e com `trialEndsAt` (usou o teste e não assinou) |
| `NONE` | Sem plano | sem assinatura, ou assinatura sem teste e sem período pago (inclui quem existe só no Supabase Auth) |

O PDF termina com uma **legenda** explicando cada status e o "Confirmou: Não".

A função pura `planLabelOf(sub, now)` fica em `billing/plan-policy.ts`, ao lado
das outras regras de plano.

### Pacientes

`PatientProfile` com `isDemo = false`: nome, e-mail, telefone, nome da
nutricionista (`preferredNutritionistName` de display name e nome do cadastro),
status do app (`inviteStatusOf(userId, firstAppLoginAt)`: Sem convite / Convite
enviado / Ativo) e `createdAt`. Busca e paginação no banco (Prisma).

## API (`apps/api/src/admin`)

Módulo novo `AdminModule` (controller + service), importa `SupabaseAdminModule`.
`SupabaseAdminService` ganha `listAllUsers()` (pagina `auth.admin.listUsers`).

- `GET /v1/admin/nutritionists`
  - Query: `search?` (nome ou e-mail, contém, sem diferenciar maiúsculas e
    acentos), `confirmed?` (`yes` | `no`), `plan?` (`COMP` | `PRO` |
    `ESSENCIAL` | `TRIAL` | `TRIAL_ENDED` | `EXPIRED` | `NONE`), `createdFrom?`, `createdTo?`
    (`YYYY-MM-DD`, dias de São Paulo, ambos inclusivos), `page` (≥ 1, padrão 1),
    `pageSize` (1–100, padrão 20).
  - Ordenação: cadastro mais recente primeiro.
  - Resposta: `Paginated<AdminNutritionistRow>`:
    `{ id: string | null; name: string; email: string; phone: string | null;
    confirmed: boolean; patientCount: number; plan: AdminPlanLabel;
    createdAt: string }` (`id` é o `NutritionistProfile.id`; nulo para não
    confirmado).
- `GET /v1/admin/nutritionists/report.pdf`
  - Mesmos filtros, **sem** `page`/`pageSize`: todas as linhas que passam nos
    filtros.
  - PDF (pdfmake, `renderPdf` existente), A4 paisagem: título "Nutricionistas —
    iNutri", data e hora de geração (São Paulo), resumo dos filtros aplicados
    ("Sem filtros" quando vazio), total de linhas e a tabela com as 6 colunas da
    listagem + data de cadastro.
  - `Content-Type: application/pdf`,
    `Content-Disposition: attachment; filename="nutricionistas-AAAA-MM-DD.pdf"`.
- `GET /v1/admin/nutritionists/:id`
  - `id` = `NutritionistProfile.id`. 404 se não existir.
  - Resposta: `{ nutritionist: AdminNutritionistRow; patients:
    AdminPatientRow[] }` — todos os pacientes reais dela, mais recentes primeiro.
- `GET /v1/admin/patients`
  - Query: `search?` (nome, e-mail ou telefone), `page`, `pageSize` (mesmos
    limites).
  - Resposta: `Paginated<AdminPatientRow>`:
    `{ id: string; name: string; email: string | null; phone: string | null;
    nutritionistName: string; inviteStatus: PatientInviteStatus;
    createdAt: string }`.
- `GET /v1/auth/me`: ganha `isAdmin: boolean`.

Tipos em `packages/shared-types/src/v1/admin.ts`.

## Web (`apps/web`)

- `app/(app)/admin/page.tsx` (server): `getCurrentUser()`; sem `isAdmin` ⇒
  `notFound()`. Renderiza `AdminView`.
- `app/(app)/admin/nutritionists/[id]/page.tsx` (server): mesma checagem;
  renderiza `AdminNutritionistDetail`.
- `components/admin/admin-view.tsx`: `Tabs` Nutricionistas / Pacientes, aba na
  URL (`?tab=nutricionistas|pacientes`, padrão nutricionistas).
- `components/admin/nutritionists-tab.tsx`:
  - Filtros: busca (debounce 300 ms), Confirmou (Todos/Sim/Não), Plano (Todos +
    os 7 rótulos), Cadastro de/até (`type="date"`). Mudar um filtro volta para a
    página 1.
  - Tabela: Nome, E-mail, Telefone, Confirmou (Sim/Não), Pacientes, Plano,
    Cadastro. Coluna do nome fixa na rolagem interna (mesmo padrão da lista de
    pacientes). Linha com `id` abre o detalhe; linha sem `id` (não confirmado)
    não é clicável.
  - Paginação "Anterior / Próxima" com "Página X de Y".
  - Botão **Baixar relatório (PDF)**: baixa o PDF com os filtros ativos;
    "Gerando…" e desabilitado enquanto baixa; erro ⇒ toast.
- `components/admin/patients-tab.tsx`: busca + tabela (Paciente, E-mail,
  Telefone, Nutricionista, Status do app, Cadastro) + paginação.
- `components/admin/nutritionist-detail.tsx`: "Voltar para o painel", cabeçalho
  (nome, e-mail, telefone, plano, pacientes, cadastro) e a tabela de pacientes.
- `lib/api/admin.ts` + `lib/queries/admin.ts` (React Query).

## Testes

**API**
- `AdminGuard`: e-mail na lista ⇒ passa; fora da lista, lista vazia ou sem
  usuário local ⇒ `NotFoundException`; comparação ignora maiúsculas e espaços.
- `planLabelOf`: cada linha da tabela de rótulos, incluindo os limites de data.
- Serviço de nutricionistas:
  - junta banco + Supabase; descarta convidados e quem já tem `User` local;
  - cada filtro (`search` com acento e maiúsculas, `confirmed`, `plan`, datas
    inclusivas em São Paulo), ordenação e paginação;
  - 502 quando `listUsers` falha.
- PDF: usa todas as linhas filtradas (ignora paginação) e inclui o resumo dos
  filtros.
- Detalhe: 404 para id inexistente; devolve só pacientes reais.
- Pacientes: busca, paginação, sem demos, status do app e nome da nutricionista.
- `/auth/me`: `isAdmin` verdadeiro/falso.

**Web**
- Página: `notFound()` para quem não é admin.
- Aba Nutricionistas: filtros vão para a query, mudar filtro volta à página 1,
  paginação, linha não confirmada não navega, download chama o PDF com os
  filtros.
- Aba Pacientes e detalhe: renderizam as linhas.

## Riscos

- **Dados de saúde e contato de todos os tenants** passam a ser visíveis para o
  admin. Mitigação: só leitura, sem ficha clínica, acesso por allowlist na API e
  404 para os demais.
- **Lista inteira do Supabase a cada chamada.** Aceitável no volume atual; ver
  "Escala".
- **`ADMIN_EMAILS` precisa ser configurada no Render**; sem ela, o painel fica
  inacessível (comportamento seguro).
