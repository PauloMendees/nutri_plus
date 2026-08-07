# Assinatura Paga + Trial de 7 dias (Asaas) — Design

**Date:** 2026-08-04
**Branch:** `feat/assinatura-pagamentos` (off main)
**Status:** Approved design — ready for implementation plan

Transição do nutri_plus para o **modelo de assinatura paga** com **trial de 7 dias sem cartão**. O cliente pagante é o **nutricionista** (`NutritionistProfile`); o paciente segue usando o app **grátis e sem nenhuma mudança**. Este spec cobre, num único ciclo, **SP1 (planos + trial + gating + paywall)** e **SP2 (gateway de pagamento Asaas)**.

## Decisões (do brainstorming)

- **Estrutura de planos:** 2 níveis — **Essencial** e **Pro** (Opção A).
- **Trial:** **sem cartão**, 7 dias, acesso nível-Pro. Vive na app (`trialEndsAt`); o Asaas só entra na conversão.
- **Expiração / inadimplência:** conta vira **somente-leitura** (lê os dados dos pacientes, não cria/edita) — preserva dado (LGPD) e mantém pressão de conversão.
- **Períodos:** **mensal e anual** desde o lançamento (anual com ~2 meses grátis; o desconto anual é o gancho de conversão).
- **Cota de IA:** ao esgotar → **bloqueia a ação com CTA de upgrade**; cotas generosas. Excedente pago fica pra depois (SP3).
- **Contas atuais:** **cortesia de 30 dias** (base real já usa de graça) + `isComp` (founder/testadores) isento permanente.
- **Gateway:** **Asaas** — Pix nativo com taxa mínima, sem custo fixo mensal, assinaturas recorrentes + webhooks, sandbox. Cartão auto-recorre; Pix/boleto = cobrança por ciclo que o cliente quita.

## Matriz de planos (entitlements)

Durante trial (7d) **e** cortesia (30d), o acesso é **nível Pro** (o nutri experimenta tudo antes de escolher).

| Recurso | **Essencial** R$49/mês · R$490/ano | **Pro** R$99/mês · R$990/ano |
|---|---|---|
| Pacientes (CRUD, foto, IMC) | ✅ ilimitado | ✅ ilimitado |
| Planos alimentares (editor manual + PDF) | ✅ | ✅ |
| Bioimpedância/antropometria + PDF evolução | ✅ | ✅ |
| Agenda + categorias | ✅ | ✅ |
| Base TACO + itens de alimento | ✅ | ✅ |
| Anamnese, recordatório 24h | ✅ | ✅ |
| App do paciente + lembretes push | ✅ | ✅ |
| Contabilidade (financeiro) | ✅ | ✅ |
| **Ações de IA/mês** (gerar plano + ajuste IA) | **30** | **200** |
| **Silhueta** (estimativa por foto/visão) | 🔒 só Pro | ✅ (cap 40/mês) |
| **Transcrição de consulta** | 🔒 só Pro | ✅ (cap 30/mês) |
| **Funcionários** (assentos RBAC) | 🔒 solo | ✅ até 2 |

**Regras de gating:**
- **Cota de IA** conta as 2 ações **iniciadas pelo nutricionista** (`MEAL_PLAN_GENERATION`, `MEAL_PLAN_ADJUSTMENT` — as caras, `smart`-tier); esgotou → **402 `AI_QUOTA_EXCEEDED`** (CTA upgrade/aguardar renovação). **Fora-de-casa (`OUTSIDE_HOME_SUGGESTION`) NÃO entra na cota** — é iniciada pelo **paciente** no app grátis (`@Roles(PATIENT)`, modelo `fast` barato); não dá pra mostrar paywall de nutri a um paciente. Continua **registrada** (carimba o `nutritionistId` do paciente) pra análise, mas nunca bloqueia.
- **Silhueta / transcrição / funcionários** = exclusivos do Pro (na Essencial: cadeado + upsell). No Pro têm cap próprio via contagem (`SILHUETA_SCAN` 40, `CONSULTATION_TRANSCRIPTION` 30) pra proteger a margem dos dois recursos de IA mais caros.
- **Trial/cortesia** = acesso Pro até `trialEndsAt`; depois → somente-leitura se não assinar.
- **`isComp`** = Pro permanente, nunca gateado.

**Todos os valores (R$, 30/200, 40/30, 2 assentos, 7/30 dias) são configuráveis** — a estrutura é o que importa. Centralizar num único mapa de config no servidor (fonte da verdade), refletido nos textos da web.

## Modelo de dados (migração aditiva)

Convenção do schema: camelCase, sem `@map`/`@db`, `@default(uuid())`, tabelas PascalCase.

```prisma
enum PlanTier { ESSENCIAL PRO }
enum BillingPeriod { MONTHLY YEARLY }
enum SubscriptionStatus { TRIALING ACTIVE PAST_DUE CANCELED }

model Subscription {
  id             String   @id @default(uuid())
  nutritionistId String   @unique
  nutritionist   NutritionistProfile @relation(fields: [nutritionistId], references: [id], onDelete: Cascade)

  status         SubscriptionStatus @default(TRIALING)
  isComp         Boolean  @default(false)   // founder/testadores: Pro permanente, nunca gateado
  trialEndsAt    DateTime?                  // trial 7d (novos) ou cortesia 30d (existentes)

  plan           PlanTier?                  // plano assinado (null no trial → acesso Pro por regra)
  billingPeriod  BillingPeriod?
  currentPeriodEnd  DateTime?               // "pago até" (vem do Asaas)
  cancelAtPeriodEnd Boolean @default(false) // cancelou mas segue até o fim do ciclo pago

  asaasCustomerId     String?
  asaasSubscriptionId String?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  payments       SubscriptionPayment[]

  @@index([status])
}

model SubscriptionPayment {           // auditoria + histórico de faturas (escrito via webhook)
  id             String   @id @default(uuid())
  subscriptionId String
  subscription   Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  asaasPaymentId String   @unique     // idempotência: Asaas re-tenta webhooks
  amount         Float
  status         String                // CONFIRMED | RECEIVED | OVERDUE | REFUNDED ...
  billingType    String?               // PIX | CREDIT_CARD | BOLETO
  dueDate        DateTime?
  paidAt         DateTime?
  createdAt      DateTime @default(now())

  @@index([subscriptionId, createdAt])
}
```

Toques aditivos:
- `NutritionistProfile += subscription Subscription?` (back-relation).
- **`AIInteraction += nutritionistId String?`** + `@@index([nutritionistId, createdAt])` — carimba o tenant em toda chamada de IA. **As cotas e os caps saem de `count()` nessa tabela** (que já tem `type`, `success`, `createdAt`) — sem tabela nova de contador. Relação opcional `NutritionistProfile.aiInteractions` (onDelete: SetNull) pra integridade; carimbo feito onde o serviço já resolve o `nutritionistId`.

**Acesso derivado (calculado, não armazenado):**
- `isComp` → `{ tier: PRO, isReadOnly: false }`
- `status = ACTIVE` e dentro do período pago → `{ tier: plan, isReadOnly: false }`
- `status = TRIALING` e `now < trialEndsAt` → `{ tier: PRO, isReadOnly: false }`
- senão (trial expirado, `PAST_DUE`, `CANCELED` após período) → `{ isReadOnly: true }`

**Janela da cota:** **mês-calendário** (reseta no dia 1, `America/Sao_Paulo`) — simples de explicar e computar (`count(... where createdAt >= startOfMonth)`).

## Enforcement (API)

Novo módulo `billing`, com um **`EntitlementsService`** como fonte única da verdade.

**`EntitlementsService`:**
- `getEntitlements(nutritionistId)` → `{ tier, isReadOnly, features:{silhueta,transcription,employees}, aiQuota, aiUsed }`. Uma query indexada por tenant.
- `assertAiQuota(nutritionistId, type)` → `count()` de `AIInteraction` (success, tipo, mês corrente); ≥ limite → **402 `AI_QUOTA_EXCEEDED`**.
- `assertSeatAvailable(nutritionistId)` → Pro + funcionários < 2; senão **402 `SEAT_LIMIT`**.

**`SubscriptionGuard` (3º `APP_GUARD`, após `RolesGuard`):**
- `@Public` ou role `PATIENT` → libera (paciente grátis, intocado).
- Rotas de billing (`@BillingExempt`) e **GET/HEAD/OPTIONS** → liberam (read-only ainda lê).
- Escrita (POST/PUT/PATCH/DELETE) de NUTRITIONIST/EMPLOYEE com conta read-only → **402 `READ_ONLY`**.
- Handler com `@RequiresFeature('silhueta'|'transcription'|'employees')` sem direito → **402 `FEATURE_PRO_ONLY`** (com `feature`). Aplicado em: Silhueta `POST /patients/:id/silhueta`, transcrição `POST /patients/:id/audios/:audioId/transcribe`, funcionários `POST /employees`.

**Cota de IA — inline nos serviços do nutricionista** (`MealGenerationService.generate` e `.adjust`): `assertAiQuota(nutritionistId, type)` **antes** de chamar a OpenAI. Todos os serviços de IA (inclusive `outside-home` e transcrição) passam a **carimbar `nutritionistId`** ao registrar o `AIInteraction` (via `generateStructured`/`transcribeAudio`). Silhueta/transcrição = feature-gated (Pro) + cap próprio por contagem (40/30); `outside-home` só carimba (não bloqueia).

**Contrato de erro (402):** corpo `{ statusCode: 402, code, feature? }`, `code ∈ {READ_ONLY, AI_QUOTA_EXCEEDED, FEATURE_PRO_ONLY, SEAT_LIMIT}` — legível por máquina, pra web mapear na UI certa.

**Split:** o guard faz o grosso declarativo (read-only + feature); os serviços fazem o fino contextual (cota de IA, assento).

## Integração Asaas (checkout, webhook, ciclo de vida)

**`AsaasService`** — `fetch` puro (sem dep nova no servidor, igual ao Expo push). Env: `ASAAS_API_KEY`, `ASAAS_API_URL` (sandbox/prod), `ASAAS_WEBHOOK_TOKEN`.

**Checkout — `POST /v1/me/subscription/checkout`** (`@Roles(NUTRITIONIST)`, `@BillingExempt`), body `{ plan, period, cpfCnpj }`:
1. Garante/cria o **customer** no Asaas (guarda `asaasCustomerId`).
2. Cria a **assinatura** (`value` do plano+período, `cycle` = MONTHLY/YEARLY, `billingType: UNDEFINED` → cliente escolhe Pix ou cartão na página hospedada, `nextDueDate` = hoje).
3. Guarda `asaasSubscriptionId`; status continua TRIALING/read-only **até o pagamento confirmar**.
4. Retorna `{ invoiceUrl }` → web redireciona pra página hospedada do Asaas.

**Decisão PCI:** usar o `invoiceUrl` **hospedado** tira o cartão do nosso servidor (nenhum PAN trafega pela nossa API). Pix nem toca cartão.
**Coleta obrigatória:** o Asaas exige **CPF/CNPJ** pra assinatura → o paywall coleta (nome/e-mail já temos).

**Webhook — `POST /v1/internal/asaas/webhook`** (`@Public` + segredo `asaas-access-token` fail-closed 401, padrão do endpoint de lembretes). **Idempotente** por `asaasPaymentId`:
- `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` → grava `SubscriptionPayment`; status = **ACTIVE**; seta `plan`/`billingPeriod`/`currentPeriodEnd`. Sai do read-only.
- `PAYMENT_OVERDUE` → **PAST_DUE** (→ read-only).
- `PAYMENT_REFUNDED`/`SUBSCRIPTION_DELETED` → grava/–> **CANCELED**.

**Cancelar — `POST /v1/me/subscription/cancel`** (`@Roles(NUTRITIONIST)`) → chama o Asaas + seta `cancelAtPeriodEnd=true`; acesso segue até `currentPeriodEnd`, depois read-only.

**Semeadura de assinaturas:**
- **Novo cadastro** (fluxo de signup existente) → cria `Subscription{ TRIALING, trialEndsAt: now+7d }` no servidor.
- **Migração das contas atuais** → migração/seed one-off: todo nutricionista sem assinatura ganha `Subscription{ TRIALING, trialEndsAt: <lançamento>+30d }` (cortesia); founder/testadores → `isComp=true` (allowlist).

## Web (paywall, gating visual, billing) — *mobile intocado*

**Bootstrap:** novo `GET /v1/me/subscription` → `{ status, tier, isReadOnly, trialEndsAt, currentPeriodEnd, plan, billingPeriod, cancelAtPeriodEnd, features, aiQuota, aiUsed }`, exposto por um hook `useEntitlements()` carregado no app-shell.

**App-shell (`(app)/layout` + `app-sidebar`):**
- **Banner de trial/cortesia:** "Seu teste termina em X dias" + CTA **Assinar**.
- **Banner somente-leitura:** "Acesso em somente-leitura — assine para voltar a editar" + CTA.
- Helper de `useEntitlements()` desabilita botões de criar/editar quando `isReadOnly`.

**Paywall `(app)/assinatura`:** cards Essencial/Pro + toggle **mensal/anual** (mostra o desconto), seleção → form com **CPF/CNPJ** → `POST /me/subscription/checkout` → redireciona pro `invoiceUrl`. Na volta: tela "aguardando confirmação" que faz *poll* em `useEntitlements()` até `ACTIVE` (Pix = segundos, cartão = na hora).

**Tratamento de 402 no `apiFetch`** (por `code`): `READ_ONLY` → paywall · `AI_QUOTA_EXCEEDED` → modal "cota de IA do mês esgotada" + upgrade · `FEATURE_PRO_ONLY` → upsell Pro (com o recurso) · `SEAT_LIMIT` → upsell.

**Locks visuais** (dirigidos por `features`): botões **Silhueta**, **Transcrever** e **Adicionar funcionário** com 🔒 + upsell quando o plano não inclui (nem chama a API). **Chip de cota:** "IA: 12/30 ações este mês".

**Configurações → nova aba "Assinatura":** plano atual, status, próxima cobrança, método, **histórico de faturas** (do `SubscriptionPayment`), **trocar plano** (→ paywall) e **cancelar** (com confirmação).

**Signup:** o fluxo atual passa a criar a `Subscription` de trial (7d) no servidor; a tela ganha um "7 dias grátis, sem cartão".

## Testes

- **API (jest):**
  - `EntitlementsService`: acesso derivado nos 5 estados (isComp→Pro; ACTIVE dentro do período; TRIALING antes/depois de `trialEndsAt`; PAST_DUE/CANCELED→read-only); `assertAiQuota` sob/no/acima do limite (conta só `success` + mês corrente + tipos elegíveis); `assertSeatAvailable`; features por plano.
  - `SubscriptionGuard`: Public/PATIENT/GET passam; escrita read-only → 402 `READ_ONLY`; `@RequiresFeature` sem direito → 402 `FEATURE_PRO_ONLY`; rotas de billing isentas.
  - Serviços de IA: cota estoura **antes** da OpenAI; `nutritionistId` carimbado no `AIInteraction`.
  - `AsaasService`: mock `fetch` — payload de customer/subscription; webhook `CONFIRMED→ACTIVE`, `OVERDUE→PAST_DUE`, **idempotência** por `asaasPaymentId`; segredo fail-closed 401.
  - Checkout: exige CPF/CNPJ; cria customer+sub; retorna `invoiceUrl`.
  - Signup semeia trial; migração semeia cortesia.
- **Web (vitest):** `useEntitlements`; paywall + submit; interceptação de 402 → UI certa; locks (bloqueado vs liberado); banners + botões desabilitados em read-only; aba Assinatura (plano/faturas/cancelar).
- **shared-types:** build limpo.
- **mobile:** `tsc` intacto (fora de escopo).

## Restrições globais

- Migração **aditiva** (`Subscription`, `SubscriptionPayment`, enums `PlanTier`/`BillingPeriod`/`SubscriptionStatus`, `AIInteraction.nutritionistId` + índice, back-relations). `prisma migrate dev`; `prisma generate` se necessário. **shared-types reconstruído.**
- **Sem dependência nova no servidor** (Asaas via `fetch`). Web reusa react-query / react-hook-form + zod / shadcn — sem dep nova salvo essencial. pt-BR.
- Cliente pagante = `NutritionistProfile`; **paciente e app mobile grátis e INALTERADOS**.
- Self-serve = `@Roles(NUTRITIONIST)` + `resolveScopeNutritionistId`; webhook = `@Public` + segredo `asaas-access-token` **fail-closed** (padrão do endpoint interno de lembretes).
- Reusar: `resolveScopeNutritionistId`, `AIInteraction` p/ medição, padrão `APP_GUARD` (guard global), controllers `me/*`, abas de Configurações, `apiFetch`, histórico datado.
- **Contrato 402** com `code` (`READ_ONLY`/`AI_QUOTA_EXCEEDED`/`FEATURE_PRO_ONLY`/`SEAT_LIMIT`).
- Valores como **config única no servidor**: Essencial R$49/R$490 (30 IA) · Pro R$99/R$990 (200 IA + Silhueta cap 40 + transcrição cap 30 + 2 assentos) · trial 7d nível-Pro · cortesia 30d · `isComp` allowlist · cota = **mês-calendário (America/Sao_Paulo)**.
- Env novas: `ASAAS_API_KEY`, `ASAAS_API_URL`, `ASAAS_WEBHOOK_TOKEN` (adicionar ao `env.schema`; valores como segredo no Render — `sync:false`).
- Aspas: api single quotes; web por arquivo. Testes API JEST / web vitest. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch `feat/assinatura-pagamentos`. **Não** push/PR sem pedir. Verificar por área: shared-types build; API test+tsc; web test+tsc; mobile tsc (não deve ripar).

## Mapa de arquivos (grupos naturais de tarefa)

1. **Modelo + shared-types + config:** `apps/api/prisma/schema.prisma` (+ migração) · `packages/shared-types/src/v1/billing.ts` (novo: `PlanTier`, `BillingPeriod`, `SubscriptionStatus`, `Entitlements`, `CheckoutRequest`, `SubscriptionView`) + `v1/index.ts` · mapa de config de planos no servidor.
2. **EntitlementsService + SubscriptionGuard + decorators:** `apps/api/src/billing/**` (service, guard, `@RequiresFeature`, `@BillingExempt`) + registro do 3º `APP_GUARD` no `app.module` + specs.
3. **Cota de IA nos serviços:** `apps/api/src/ai/ai-interactions.service.ts` (+`nutritionistId`), `meal-generation`, `outside-home`, `meal-plan-adjustment` (assert + carimbo); Silhueta/transcrição caps.
4. **AsaasService + checkout + webhook + cancel:** `apps/api/src/billing/asaas.service.ts`, `me-subscription.controller.ts` (`me/subscription/*`), `internal-asaas.controller.ts` (`internal/asaas/webhook`) + `env.schema` + specs.
5. **Seed trial/cortesia + signup:** hook no fluxo de signup (`users`/`auth`) + migração/seed one-off de cortesia + `isComp` allowlist.
6. **Web bootstrap + banners + locks:** `GET /me/subscription`, `lib/api/subscription.ts` + `lib/queries/subscription.ts` + `useEntitlements`, banners no `(app)/layout`, interceptação de 402 no `apiFetch`, locks nos botões (Silhueta/Transcrever/Funcionário) + chip de cota.
7. **Paywall + checkout:** `apps/web/src/app/(app)/assinatura/**` (cards, toggle mensal/anual, form CPF/CNPJ, redirect + tela de confirmação com poll).
8. **Aba Assinatura (Configurações):** plano/status/próxima cobrança/faturas/trocar/cancelar.
