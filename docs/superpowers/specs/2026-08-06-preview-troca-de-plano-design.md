# Preview de Valor na Troca de Plano — Design

**Date:** 2026-08-06
**Branch:** `feat/assinatura-pagamentos` (mesmo PR #54)
**Status:** Approved design — ready for implementation plan

Hoje, o assinante ativo escolhe um plano no `PlanPicker` e o `changePlan` é chamado **imediatamente** (já cobra) — o usuário não vê quanto vai pagar antes de confirmar. Este projeto adiciona um **preview** (autoritativo, do server) + um **passo de confirmação** antes de executar.

## Decisão (do brainstorming)

- **Preview no server** (não no frontend): um endpoint reusa a **mesma** lógica de proração do `changePlan`, sem executar. O valor mostrado bate exatamente com o cobrado (dinheiro é autoritativo no server; evita divergência de fórmula duplicada).
- **Fluxo novo:** escolher plano → `preview` → painel de confirmação com os valores → **Confirmar** → `changePlan` (reusa todo o pós-processamento atual: Pix QR / sucesso do cartão / agendado).

## Estado atual (reusar)

`SubscriptionService.changePlan` (`apps/api/src/billing/subscription.service.ts`) já calcula, inline: `isUpgrade = mesmo período && tier↑`; `diff = round2((valorNovo − valorAtual) × diasRestantes / diasCiclo)`; e decide upgrade (cobra a diferença, mantém `currentPeriodEnd`) vs agendado (`updateSubscriptionValue` + `pendingPlan`). A página `(checkout)/assinatura/page.tsx` tem `onChangePlan(plan, period)` chamando `changePlan` direto; `PlanPicker` já aceita `busy`.

## Server

- **Helper privado `computeChange(sub, dto)`** — extrai a decisão/proração do `changePlan`, retornando o "plano do que aconteceria" sem executar:
  ```ts
  { kind: 'UPGRADE' | 'SCHEDULED'; amountNow: number; recurringValue: number; recurringPeriod: BillingPeriod; effectiveDate: Date }
  ```
  - **Upgrade** (mesmo período, tier↑): `amountNow = diff` (pro-rata), `recurringValue = valorNovo`, `recurringPeriod = dto.period`, `effectiveDate = currentPeriodEnd` (vencimento mantido).
  - **Agendado** (downgrade/troca de período): `amountNow = 0`, `recurringValue = valorNovo`, `recurringPeriod = dto.period`, `effectiveDate = currentPeriodEnd` (quando passa a valer).
  - `changePlan` passa a usar `computeChange` pra obter `kind`/`amountNow`/`recurringValue` (o `diff` do upgrade e o valor novo do `updateSubscriptionValue` saem daí) — **comportamento inalterado**, só refatorado pra compartilhar a lógica.
- **`previewChangePlan(nutritionistId, dto): Promise<ChangePlanPreview>`** — mesma guarda de `changePlan` (ACTIVE + `asaasSubscriptionId`/`plan`/`billingPeriod`/`currentPeriodEnd`; senão `UnprocessableEntityException({ code:'NOT_ACTIVE' })`), computa via `computeChange`, retorna os campos ISO. **Não** chama o Asaas nem grava nada.
- **Endpoint `POST /v1/me/subscription/change-plan/preview`** (`@Roles(NUTRITIONIST)`, `@BillingExempt`) body `{ plan, period }` (reusa `ChangePlanDto`) → `ChangePlanPreview`.

shared-types (`billing.ts`):
```ts
export interface ChangePlanPreview {
  kind: 'UPGRADE' | 'SCHEDULED';
  amountNow: number;       // 0 no agendado
  recurringValue: number;  // valor do plano novo por ciclo
  recurringPeriod: BillingPeriod;
  effectiveDate: string;   // ISO — vencimento (upgrade) / quando passa a valer (agendado)
}
```

## Web

- `lib/api/subscription.ts`: `previewChangePlan(body: ChangePlanRequest): Promise<ChangePlanPreview>` (POST `/me/subscription/change-plan/preview`).
- `(checkout)/assinatura/page.tsx` — no ramo do assinante ativo, escolher um plano no `PlanPicker` deixa de chamar `changePlan` direto: chama **`previewChangePlan`** (com `busy` desabilitando os botões durante o round-trip) → guarda `{ preview, choice }` → renderiza um **painel de confirmação**:
  - **Upgrade:** "Você paga **R$ {amountNow} agora** (proporcional aos dias restantes) e depois **R$ {recurringValue}/{mês|ano}**. Seu vencimento continua em **{effectiveDate}**." + `[Confirmar troca]` `[Voltar]`.
  - **Agendado:** "Sem cobrança agora. A partir de **{effectiveDate}** você paga **R$ {recurringValue}/{mês|ano}**." + `[Confirmar]` `[Voltar]`.
  - **Voltar** → volta pro `PlanPicker`.
  - **Confirmar** → chama a função `onChangePlan` atual (o `changePlan` + o pós-processamento existente: Pix QR da diferença / sucesso do cartão / `done` do agendado).
- Erro do preview (ex.: 422 `NOT_ACTIVE`) → mostra a mensagem, volta pro picker.

## Testes

- **API (jest):** `previewChangePlan` — upgrade (mesmo período, tier↑) → `{ kind:'UPGRADE', amountNow: diff>0, recurringValue: valorNovo, effectiveDate }` **sem** chamar `asaas.*` nem `prisma.subscription.update`; downgrade/período → `{ kind:'SCHEDULED', amountNow: 0, recurringValue, effectiveDate }` idem; rejeita não-ACTIVE. `changePlan` continua verde (usa o mesmo `computeChange`).
- **Web (vitest):** escolher um plano (ativo) chama `previewChangePlan` e mostra os valores (o "agora" e o recorrente); `[Confirmar]` chama `changePlan`; `[Voltar]` retorna ao picker.

## Restrições globais

- **Sem dependência nova.** pt-BR. **Dinheiro autoritativo no server** (o preview e o cobrar usam o mesmo `computeChange`).
- Preview **não** faz efeito colateral (Asaas/DB). `previewChangePlan` só para `status === ACTIVE`.
- Self-serve `@Roles(NUTRITIONIST)` + `@BillingExempt`. Cliente pagante = `NutritionistProfile`; paciente/mobile **inalterados**.
- Mesma branch `feat/assinatura-pagamentos` (mesmo PR #54). Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** abrir novo PR. Verificar por área: shared-types build; API test+tsc; web test+tsc; mobile tsc (não deve ripar).

## Mapa de arquivos (grupos naturais de tarefa)

1. **shared-types + server:** `billing.ts` (`ChangePlanPreview`); `subscription.service.ts` (`computeChange` + `previewChangePlan`, refatorar `changePlan` pra usar o helper); `me-subscription.controller.ts` (rota preview) + specs.
2. **Web:** `lib/api/subscription.ts` (`previewChangePlan`) + `(checkout)/assinatura/page.tsx` (passo de confirmação) + testes.
