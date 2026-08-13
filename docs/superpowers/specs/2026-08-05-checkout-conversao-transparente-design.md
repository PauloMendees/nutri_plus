# Conversão + Checkout Transparente (Asaas) — Design

**Date:** 2026-08-05
**Branch:** `feat/assinatura-pagamentos` (mesmo PR #54, sobre o fluxo de assinatura já mergeado nessa branch)
**Status:** Approved design — ready for implementation plan

Melhorias de **conversão** no fluxo de assinatura/onboarding, descobertas ao testar o fluxo real: auto-login pós-confirmação, onboarding com seleção de plano em tela focada, cards mais convertíveis + mobile, **checkout transparente** (Pix QR + cartão in-app, sem redirecionar pro ambiente hospedado do Asaas) e gerenciamento de método de pagamento.

## Decisões (do brainstorming)

- **Checkout transparente completo**: Pix (QR + copia-e-cola + polling) **e** cartão (form nosso → API → Asaas, confirma na hora). Assume a responsabilidade PCI do cartão (HTTPS, nunca armazenar/logar o PAN, repassar direto ao Asaas). Some o `invoiceUrl` hospedado.
- **Gate de onboarding uma-vez + banner**: no 1º acesso (conta sem escolha) a tela de planos aparece; escolheu → não aparece mais, só o banner de trial cutuca.
- **Trial começa no clique** "Começar teste grátis", não silenciosamente no signup.
- **Gerenciamento de método completo**: ver método atual, atualizar/trocar cartão, alternar Pix↔cartão (cartão = auto-renovação).

## Estado atual (reusar / substituir)

- **Auth:** `apps/web/src/app/auth/callback/route.ts` já faz `exchangeCodeForSession` + `syncUser` + redirect `/` — ou seja, **já auto-loga**. `apps/web/src/app/(auth)/verify-email/page.tsx` manda "Entrar" pra `/login` (o atrito). Signup cria nutricionista via `syncUser` → `UsersService.createNutritionist` (hoje semeia trial 7d no signup).
- **Billing (a alterar):** `AsaasService.createSubscription` usa `billingType: 'UNDEFINED'` e devolve `invoiceUrl` (será substituído por Pix/cartão transparente). `SubscriptionService.checkout/getView/cancel/handleWebhook`. `subscription.guard` + `@BillingExempt` nas rotas `me/subscription`. `/assinatura` hoje vive em `app/(app)/` (com sidebar) e redireciona pro `invoiceUrl`.
- **Web:** `PlanPicker`, `AssinaturaPage`, `SubscriptionTab`, `useSubscription`, `billing-errors`/`BillingGate` (banners + 402).

## 1. Auth + Onboarding (pontos 1, 2, 3)

- **Auto-login (1):** o link do e-mail de confirmação deve passar pelo `/auth/callback` (que já estabelece a sessão). A `verify-email` deixa de priorizar `/login`. *(Ajuste do template do e-mail é no painel Supabase — `{{ .ConfirmationURL }}` apontando pro callback; documentar como passo de deploy. O código do callback já suporta.)* Após confirmar, cai logado e o gate leva ao onboarding.
- **Gate (2):** ao autenticar como **NUTRITIONIST**, se `onboardedAt == null` → redireciona pra tela de planos. Funcionário (EMPLOYEE) não vê o gate. 3 CTAs: **Começar teste grátis (7 dias)** · **Assinar Essencial** · **Assinar Pro**.
  - "Começar teste grátis" → `POST /me/subscription/start-trial` (seta `trialEndsAt=now+7d`, `onboardedAt=now`, status TRIALING) → entra no app.
  - "Assinar" → checkout transparente → ao confirmar, seta `onboardedAt`.
  - Escolhido uma vez, o gate some; o **banner de trial** segue cutucando.
- **Layout sem sidebar (3):** a tela de planos/checkout sai de `(app)` e vai pra um grupo **`(checkout)`** com layout minimalista (logo + conteúdo centralizado). A rota `/assinatura` serve onboarding **e** "trocar plano" (o CTA de trial só aparece quando ainda elegível: `onboardedAt == null`). Sucesso/entrar no trial → redireciona `/`.

## 2. Checkout transparente Pix + cartão (pontos 4, 5)

**`AsaasService` (some o `invoiceUrl`):**
- **Pix:** `createPixSubscription({customerId, value, cycle, description})` → assinatura `billingType:'PIX'`, pega o 1º pagamento, `GET /payments/{id}/pixQrCode` → `{ encodedImage, payload }`. Retorna `{ subscriptionId, pixQrCode }`. Status só vira ACTIVE via webhook.
- **Cartão:** `createCardSubscription({customerId, value, cycle, description, card, holderInfo, remoteIp})` → `billingType:'CREDIT_CARD'` + `creditCard` + `creditCardHolderInfo` + `remoteIp`. Cobra a 1ª parcela na hora; devolve status + `last4`/`brand`. `CONFIRMED/RECEIVED` → **ACTIVE já na resposta** (webhook reconcilia); recusado → erro.
- **Update (ponto 6):** `updateSubscriptionBilling(subscriptionId, {method, card?, holderInfo?, remoteIp?})` → `POST /subscriptions/{id}` trocando `billingType` (+ tokeniza novo cartão, ou volta pra Pix).

**PCI:** cartão vai *form → nossa API → Asaas*, **nunca** persistido (só `last4`/`brand`/token) nem logado (o DTO de cartão fica fora de qualquer log; `AsaasService.call` não loga request body). Prod HTTPS.

**API — `POST /me/subscription/checkout`** ganha `method: 'PIX' | 'CREDIT_CARD'` e, no cartão, `card{ holderName, number, expiryMonth, expiryYear, ccv }` + `holderInfo{ postalCode, addressNumber, phone }` (nome/email/CPF já temos). `remoteIp` lido do request. Resposta é união: **Pix →** `{ method:'PIX', pixQrCode }`; **Cartão →** `{ method:'CREDIT_CARD', status }`. Grava `onboardedAt`, `plan`, `billingPeriod`, `paymentMethod`, `cardLast4/cardBrand`. Recusa **não** grava plano/onboarding.

**Web (convertível + mobile-first):**
- **Cards** (redesenho `PlanPicker`): Essencial/Pro lado a lado (empilham no mobile), toggle **mensal/anual** com selo "2 meses grátis", **Pro destacado ("Mais popular")**, benefícios com ✓, preço grande. No onboarding, CTA leve "Continuar com teste grátis".
- **Passo de pagamento** (abas **Pix** | **Cartão**):
  - **Pix** → renderiza o QR (`<img src="data:image/png;base64,{encodedImage}">`) + copia-e-cola + "Aguardando pagamento…" e faz *poll* de `useSubscription` até ACTIVE → sucesso. Mostra validade do QR.
  - **Cartão** → form (número, titular, validade MM/AA, CVV, CPF, CEP, nº, telefone) → envia → resultado na hora (sucesso ou "cartão recusado").

## 3. Gerenciar método de pagamento (ponto 6)

- **Aba "Assinatura":** mostra o **método atual** ("Pix" ou "Cartão •••• 1234 (Visa)"). Ações (reusam os componentes do checkout): no **Pix** → "Trocar para cartão" (dica: passa a auto-renovar); no **cartão** → "Atualizar cartão" + "Mudar para Pix". Mantém trocar plano / cancelar / faturas.
- **API — `POST /me/subscription/payment-method`** (`@Roles(NUTRITIONIST)`, `@BillingExempt`), body `{ method, card?, holderInfo? }` → `updateSubscriptionBilling` no Asaas + grava `paymentMethod`/`cardLast4`/`cardBrand`.

## Modelo de dados (migração aditiva)

```prisma
Subscription += onboardedAt   DateTime?  // gate: null = ainda não escolheu
Subscription += paymentMethod String?    // 'PIX' | 'CREDIT_CARD'
Subscription += cardLast4     String?
Subscription += cardBrand     String?
```
- `trialEndsAt` (já nullable) passa a ser setado no clique "Começar teste grátis" (não no signup).
- **Migração:** contas existentes (trial/cortesia) → `onboardedAt = now` (não veem o gate). Novos signups → `onboardedAt = null`, `trialEndsAt = null`.

**shared-types:** `CheckoutRequest` += `method` + `card`/`holderInfo`; `CheckoutResponse` vira união (`{ method:'PIX', pixQrCode }` | `{ method:'CREDIT_CARD', status }`); `SubscriptionView` += `paymentMethod`/`cardLast4`/`cardBrand`; novos `PixQrCode`, `CardInput`, `CardHolderInfo`, `PaymentMethodRequest`.

## Endpoints (resumo)

- `GET /v1/me/subscription` — view (+ método/cartão).
- `POST /v1/me/subscription/start-trial` *(novo)*.
- `POST /v1/me/subscription/checkout` *(alterado — método-consciente, resposta união)*.
- `POST /v1/me/subscription/payment-method` *(novo)*.
- `POST /v1/me/subscription/cancel` + webhook — inalterados (webhook reconcilia status).

**Follow-up conhecido (I2, parqueado — não expandir escopo aqui):** no **cartão**, `plan`/`billingPeriod` são gravados na **confirmação síncrona** (Asaas CONFIRMED) → sem concessão antes do pagamento. No **Pix de um assinante já ACTIVE trocando de plano**, gravar o plano no checkout ainda concederia a faixa nova antes de pagar o novo Pix — mesmo caso do I2. Não ocorre no lançamento (contas nascem TRIALING→Pro) e a correção definitiva (`pendingPlan` + promover no webhook) segue como follow-up separado, conforme já parqueado no PR #54.

## Testes

- **API (jest):** `AsaasService` transparente (mock `fetch`: pixQrCode; payload de cartão com `creditCard`/`creditCardHolderInfo`/`remoteIp`; `updateSubscriptionBilling`). `SubscriptionService.checkout` (Pix→qr; cartão CONFIRMED→ACTIVE na hora + grava last4/brand; recusado→erro **sem** flip de plano/onboarding; grava método). `start-trial` (seta trialEndsAt+onboardedAt). `payment-method` update. Cartão **nunca** persistido nem em log.
- **Web (vitest):** `PlanPicker` novo (cards + toggle + destaque Pro, responsivo); passo de pagamento (Pix mostra QR + poll; cartão submit → sucesso/recusa); gate redireciona no 1º acesso; layout `(checkout)` sem sidebar; `SubscriptionTab` (método atual + trocar/atualizar/alternar).
- **shared-types** build; **mobile** intocado.

## Restrições globais

- Migração **aditiva** (`onboardedAt`, `paymentMethod`, `cardLast4`, `cardBrand`). shared-types reconstruído.
- **Sem dependência nova** (Asaas via `fetch`; QR renderizado com `<img>` base64 — **sem lib de QR**). pt-BR.
- **PCI:** cartão nunca armazenado nem logado; só `last4`/`brand`/token; prod HTTPS; repassa direto ao Asaas.
- Cliente pagante = `NutritionistProfile`; paciente/mobile **inalterados**. Gate só p/ NUTRITIONIST.
- Self-serve `@Roles(NUTRITIONIST)` + `@BillingExempt`; webhook inalterado.
- Reusar: `/auth/callback`, `PlanPicker`/`SubscriptionTab`/`useSubscription`, `SubscriptionGuard`/`EntitlementsService`, componentes de checkout compartilhados entre onboarding e "trocar plano".
- Mesma branch `feat/assinatura-pagamentos` (mesmo PR #54). Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** abrir novo PR. Verificar por área: shared-types build; API test+tsc; web test+tsc; mobile tsc (não deve ripar).

## Mapa de arquivos (grupos naturais de tarefa)

1. **Modelo + shared-types:** `schema.prisma` (+ 4 campos) + migração; `v1/billing.ts` (método/cartão/qr/união).
2. **AsaasService transparente:** `createPixSubscription`, `createCardSubscription`, `updateSubscriptionBilling` + specs.
3. **SubscriptionService + endpoints:** `checkout` método-consciente, `startTrial`, `updatePaymentMethod`; `me-subscription.controller` (+ rotas); grava onboarding/método; specs.
4. **Signup trial-on-choice + backfill onboardedAt:** `users.service` (trialEndsAt=null no signup) + migração de backfill.
5. **Layout `(checkout)` + gate de onboarding:** grupo de rota sem sidebar; redirect gate (NUTRITIONIST + onboardedAt==null).
6. **PlanPicker redesenho + passo de pagamento (Pix/cartão) + polling:** UI convertível/responsiva.
7. **SubscriptionTab — método atual + trocar/atualizar/alternar.**
8. **verify-email/auth polish** (destino do "Entrar" + doc do template Supabase).
