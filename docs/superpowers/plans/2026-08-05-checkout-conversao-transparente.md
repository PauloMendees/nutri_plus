# Conversão + Checkout Transparente (Asaas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o fluxo de assinatura altamente convertível — auto-login pós-confirmação, onboarding com seleção de plano em tela focada (sem sidebar), cards responsivos, checkout **transparente** (Pix QR + cartão in-app, sem `invoiceUrl` hospedado) e gerenciamento de método de pagamento.

**Architecture:** Substitui o checkout hospedado por chamadas transparentes ao Asaas: Pix retorna QR/copia-e-cola (poll até o webhook confirmar) e cartão tokeniza direto (confirma síncrono → ACTIVE na hora). O onboarding vira um gate client-side (`onboardedAt == null` → tela de planos em um route group `(checkout)` sem sidebar); o trial passa a começar no clique "Começar teste grátis". Configurações ganha gerenciamento de método (trocar/atualizar cartão, alternar Pix↔cartão).

**Tech Stack:** NestJS 10 + Prisma 7 · Next.js 16 (App Router, react-query, shadcn/ui) · shared-types · Asaas REST v3 (fetch) · jest (API) / vitest (web).

## Global Constraints

- Migração **aditiva**: `Subscription += onboardedAt DateTime?`, `paymentMethod String?`, `cardLast4 String?`, `cardBrand String?`. Backfill `onboardedAt = now()` para as assinaturas existentes. Convenção: camelCase, sem `@map`/`@db`.
- **shared-types reconstruído** após editar `packages/shared-types` (`pnpm --filter @nutri-plus/shared-types build`).
- **Sem dependência nova** (Asaas via `fetch`; QR do Pix renderizado com `<img src="data:image/png;base64,…">` — **sem lib de QR**). Web reusa react-query / shadcn — sem dep nova. pt-BR em todo texto de UI.
- **PCI:** dados do cartão (número/CVV/validade) vão *form → nossa API → Asaas*, **nunca** persistidos (só `cardLast4`/`cardBrand`/token) nem logados (o DTO de cartão fica fora de qualquer log; `AsaasService` não loga request body). Prod HTTPS.
- Cliente pagante = `NutritionistProfile`; paciente/app mobile **inalterados** (nenhum arquivo em `apps/mobile`). Gate de onboarding só p/ **NUTRITIONIST**.
- Self-serve = `@Roles(UserRole.NUTRITIONIST)` + `@BillingExempt`; webhook inalterado (reconcilia status).
- **Trial começa no clique** "Começar teste grátis": signup cria `Subscription` com `trialEndsAt = null` (status TRIALING). `resolveAccess` já trata `trialEndsAt` null como read-only até a escolha.
- **Cartão CONFIRMED → ACTIVE já na resposta** do checkout (webhook reconcilia); Pix fica pendente até o webhook. `plan`/`billingPeriod` no cartão são gravados na confirmação síncrona.
- Mesma branch `feat/assinatura-pagamentos` (mesmo PR #54). Aspas: api single quotes; web por arquivo. Testes API jest / web vitest. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** abrir novo PR. Verificar por área: shared-types build; API test+tsc; web test+tsc; mobile tsc (não deve ripar).

---

## File Structure

**shared-types**
- Modify `packages/shared-types/src/v1/billing.ts` — `PaymentMethod`, `PixQrCode`, `CardInput`, `CardHolderInfo`; estende `CheckoutRequest`; `CheckoutResponse` vira união; `PaymentMethodRequest`; `SubscriptionView` += `onboardedAt`/`paymentMethod`/`cardLast4`/`cardBrand`.

**API**
- Modify `apps/api/prisma/schema.prisma` (+4 campos em `Subscription`) + nova migração (com backfill).
- Modify `apps/api/src/billing/asaas.service.ts` — remove `createSubscription` (invoiceUrl); adiciona `createPixSubscription`, `createCardSubscription`, `updateSubscriptionBilling`; mapeia recusa de cartão → 422.
- Modify `apps/api/src/billing/subscription.service.ts` — `checkout` método-consciente (união), `startTrial`, `updatePaymentMethod`; `getView` novos campos.
- Modify `apps/api/src/billing/dto/checkout.dto.ts` (+ `method`/`card`/`holderInfo`) + Create `apps/api/src/billing/dto/payment-method.dto.ts`.
- Modify `apps/api/src/billing/me-subscription.controller.ts` (+ `start-trial`, `payment-method`, `@Ip()`).
- Modify `apps/api/src/users/users.service.ts` — `createNutritionist` sem `trialEndsAt`.
- Modify `apps/api/src/main.ts` — `trust proxy` (IP real p/ `@Ip()`).

**Web** (`apps/web/src/`)
- Modify `lib/api/subscription.ts` — checkout união + `startTrial()` + `updatePaymentMethod()`.
- Create `app/(checkout)/layout.tsx` (minimalista, sem sidebar) + Move `app/(app)/assinatura/page.tsx` → `app/(checkout)/assinatura/page.tsx` (rework: 3 CTAs + passo de pagamento).
- Create `components/billing/onboarding-gate.tsx` (client, redireciona) + montar em `app/(app)/layout.tsx`.
- Modify `components/billing/plan-picker.tsx` (redesenho) + Create `components/billing/pix-payment.tsx`, `components/billing/card-form.tsx`.
- Modify `components/settings/subscription-tab.tsx` (método atual + gerenciar).
- Modify `app/(auth)/verify-email/page.tsx` (destino do "Entrar").
- Modify `docs/release-app-stores.md` ou nova nota de deploy (template Supabase).

---

## Task 1: shared-types — método, cartão, QR e união de checkout

**Files:**
- Modify: `packages/shared-types/src/v1/billing.ts`

**Interfaces:**
- Produces: `PaymentMethod`, `PixQrCode`, `CardInput`, `CardHolderInfo`, `PaymentMethodRequest`; `CheckoutRequest` (estendido), `CheckoutResponse` (união), `SubscriptionView` (+4 campos).

- [ ] **Step 1: Estender billing.ts**

Adicionar os tipos novos (após `PlanFeature`):

```ts
export type PaymentMethod = 'PIX' | 'CREDIT_CARD';

export interface PixQrCode {
  encodedImage: string; // PNG base64 (renderiza em <img src="data:image/png;base64,…">)
  payload: string; // copia-e-cola
}

export interface CardInput {
  holderName: string;
  number: string;
  expiryMonth: string; // 'MM'
  expiryYear: string; // 'YYYY'
  ccv: string;
}

export interface CardHolderInfo {
  postalCode: string; // CEP, só dígitos
  addressNumber: string;
  phone: string; // só dígitos
}

export interface PaymentMethodRequest {
  method: PaymentMethod;
  cpfCnpj?: string; // exigido só no CREDIT_CARD (titular); Pix não usa
  card?: CardInput;
  holderInfo?: CardHolderInfo;
}
```

Substituir `CheckoutRequest` e `CheckoutResponse`:

```ts
export interface CheckoutRequest {
  plan: PlanTier;
  period: BillingPeriod;
  cpfCnpj: string;
  method: PaymentMethod;
  card?: CardInput; // obrigatório quando method === 'CREDIT_CARD'
  holderInfo?: CardHolderInfo; // idem
}

export type CheckoutResponse =
  | { method: 'PIX'; pixQrCode: PixQrCode }
  | { method: 'CREDIT_CARD'; status: 'ACTIVE' | 'PENDING' };
```

Estender `SubscriptionView` (adicionar os 4 campos ao objeto existente):

```ts
  onboardedAt: string | null; // ISO; null = ainda não escolheu (gate)
  paymentMethod: PaymentMethod | null;
  cardLast4: string | null;
  cardBrand: string | null;
```

- [ ] **Step 2: Build (verificação)**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: build limpo; os tipos novos exportados; `CheckoutResponse` é união.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/v1/billing.ts
git commit -m "feat(shared-types): método de pagamento, cartão, Pix QR e união de checkout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Prisma — onboardedAt + paymentMethod + cardLast4/cardBrand (+ backfill)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_checkout_transparente/migration.sql` (gerado + backfill manual)

**Interfaces:**
- Produces: campos `Subscription.onboardedAt/paymentMethod/cardLast4/cardBrand`.

Migração de schema — verificação = migrate + generate + build.

- [ ] **Step 1: Adicionar os campos ao model Subscription**

No `model Subscription`, adicionar (junto aos campos existentes):

```prisma
  onboardedAt   DateTime?
  paymentMethod String?
  cardLast4     String?
  cardBrand     String?
```

- [ ] **Step 2: Gerar a migração**

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name checkout_transparente`
Expected: cria a migração; adiciona 4 colunas nullable; nada existente alterado.

- [ ] **Step 3: Adicionar o backfill ao migration.sql gerado (p/ deploys futuros)**

O `migrate dev` do Step 2 já aplicou só o DDL (as 4 colunas). Editar o `migration.sql` recém-criado e adicionar, **ao final**, o backfill (para que rode em prod/CI no `migrate deploy`):

```sql
-- Contas existentes já passaram do onboarding: não devem ver o gate.
UPDATE "Subscription" SET "onboardedAt" = now() WHERE "onboardedAt" IS NULL;
```

Como o DDL já foi aplicado no dev DB sem essa linha, rodar o backfill uma vez no dev DB manualmente:
Run: `pnpm --filter @nutri-plus/api exec prisma db execute --stdin <<< 'UPDATE "Subscription" SET "onboardedAt" = now() WHERE "onboardedAt" IS NULL;'`
Expected: as assinaturas existentes ficam com `onboardedAt` preenchido. *(Não rodar `migrate reset` — apagaria o dev DB compartilhado.)*

- [ ] **Step 4: Generate + tsc**

Run: `pnpm --filter @nutri-plus/api exec prisma generate && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: client expõe os novos campos; tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): Subscription.onboardedAt/paymentMethod/cardLast4/cardBrand (+ backfill)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: AsaasService — checkout transparente (Pix + cartão + update)

**Files:**
- Modify: `apps/api/src/billing/asaas.service.ts`
- Test: `apps/api/src/billing/asaas.service.spec.ts` (estender)

**Interfaces:**
- Consumes: `ConfigService`.
- Produces (remove `createSubscription`):
  - `createPixSubscription(input: { customerId; value; cycle; description }): Promise<{ subscriptionId: string; pixQrCode: PixQrCode }>`
  - `createCardSubscription(input: { customerId; value; cycle; description; card: CardInput; holderInfo: CardHolderInfo; holder: { name; email; cpfCnpj }; remoteIp: string }): Promise<{ subscriptionId: string; status: 'ACTIVE' | 'PENDING'; cardLast4: string | null; cardBrand: string | null }>`
  - `updateSubscriptionBilling(subscriptionId: string, input: { method: PaymentMethod; card?: CardInput; holderInfo?: CardHolderInfo; holder?: { name; email; cpfCnpj }; remoteIp?: string }): Promise<{ cardLast4: string | null; cardBrand: string | null }>`
  - mantém `ensureCustomer`, `cancelSubscription`.

- [ ] **Step 1: Estender o teste (falha primeiro)**

Adicionar ao `asaas.service.spec.ts` (mesmo padrão de mock de `fetch` do arquivo):

```ts
it('createPixSubscription cria assinatura PIX e busca o QR do 1º pagamento', async () => {
  const fetchMock = jest.spyOn(global, 'fetch' as any)
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ id: 'sub_1' }) } as any)
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'pay_1' }] }) } as any)
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ encodedImage: 'BASE64', payload: '00020126...' }) } as any);
  const out = await new AsaasService(config(CFG)).createPixSubscription({ customerId: 'cus_1', value: 49, cycle: 'MONTHLY', description: 'x' });
  expect(out).toEqual({ subscriptionId: 'sub_1', pixQrCode: { encodedImage: 'BASE64', payload: '00020126...' } });
  expect(fetchMock.mock.calls[0][0]).toBe('https://api-sandbox.asaas.com/v3/subscriptions');
  expect((fetchMock.mock.calls[0][1] as any).body).toContain('"billingType":"PIX"');
  expect(fetchMock.mock.calls[2][0]).toBe('https://api-sandbox.asaas.com/v3/payments/pay_1/pixQrCode');
});

it('createCardSubscription envia creditCard/holderInfo/remoteIp e mapeia CONFIRMED → ACTIVE + last4/brand', async () => {
  jest.spyOn(global, 'fetch' as any)
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ id: 'sub_2', creditCard: { creditCardNumber: '1234', creditCardBrand: 'MASTERCARD' } }) } as any)
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ data: [{ status: 'CONFIRMED' }] }) } as any);
  const out = await new AsaasService(config(CFG)).createCardSubscription({
    customerId: 'cus_1', value: 99, cycle: 'MONTHLY', description: 'x',
    card: { holderName: 'A B', number: '5162306219378829', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
    holderInfo: { postalCode: '01310000', addressNumber: '100', phone: '11999999999' },
    holder: { name: 'A B', email: 'a@x.com', cpfCnpj: '12345678901' }, remoteIp: '1.2.3.4',
  });
  expect(out).toEqual({ subscriptionId: 'sub_2', status: 'ACTIVE', cardLast4: '1234', cardBrand: 'MASTERCARD' });
});

it('createCardSubscription mapeia recusa do Asaas (400) para 422 sem vazar detalhe cru', async () => {
  jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 400, text: async () => '{"errors":[{"description":"Transação não autorizada"}]}' } as any);
  await expect(new AsaasService(config(CFG)).createCardSubscription({
    customerId: 'cus_1', value: 99, cycle: 'MONTHLY', description: 'x',
    card: { holderName: 'A B', number: '4', expiryMonth: '12', expiryYear: '2030', ccv: '1' },
    holderInfo: { postalCode: '0', addressNumber: '1', phone: '1' },
    holder: { name: 'A B', email: 'a@x.com', cpfCnpj: '12345678901' }, remoteIp: '1.2.3.4',
  })).rejects.toMatchObject({ status: 422 });
});
```

Run: `pnpm --filter @nutri-plus/api test asaas.service`
Expected: FAIL.

- [ ] **Step 2: Implementar (substituir `createSubscription`)**

No `asaas.service.ts`, importar os tipos e adicionar um erro estruturado + os métodos. Trocar a assinatura de `call` para expor status/corpo em falha via um erro tipado:

```ts
import { BadGatewayException, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import type { CardHolderInfo, CardInput, PaymentMethod, PixQrCode } from '@nutri-plus/shared-types';

class AsaasRequestError extends Error {
  constructor(readonly status: number, readonly body: unknown) { super(`Asaas ${status}`); }
}
```

Reescrever `call` para lançar `AsaasRequestError` em não-ok (mantendo o log truncado, sem body de request), e ter um wrapper `callOrGateway` que converte em `BadGatewayException` para os fluxos que não tratam recusa:

```ts
  private async call<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base()}${path}`, {
        method: init.method,
        headers: { 'content-type': 'application/json', access_token: this.key() },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new BadGatewayException('Asaas indisponível');
    }
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`Asaas ${init.method} ${path} → ${res.status}`);
      throw new AsaasRequestError(res.status, text ? JSON.parse(text) : null);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  private async callOrGateway<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    try {
      return await this.call<T>(path, init);
    } catch (e) {
      if (e instanceof AsaasRequestError) throw new BadGatewayException('Falha ao falar com o Asaas');
      throw e;
    }
  }
```

`ensureCustomer`/`cancelSubscription` passam a usar `callOrGateway`. Adicionar:

```ts
  async createPixSubscription(input: {
    customerId: string; value: number; cycle: 'MONTHLY' | 'YEARLY'; description: string;
  }): Promise<{ subscriptionId: string; pixQrCode: PixQrCode }> {
    const sub = await this.callOrGateway<{ id: string }>('/subscriptions', {
      method: 'POST',
      body: { customer: input.customerId, billingType: 'PIX', value: input.value, cycle: input.cycle, nextDueDate: this.todaySaoPaulo(), description: input.description },
    });
    const payments = await this.callOrGateway<{ data: { id: string }[] }>(`/subscriptions/${sub.id}/payments`, { method: 'GET' });
    const paymentId = payments.data[0]?.id;
    if (!paymentId) throw new BadGatewayException('Asaas não retornou a cobrança inicial');
    const qr = await this.callOrGateway<{ encodedImage: string; payload: string }>(`/payments/${paymentId}/pixQrCode`, { method: 'GET' });
    return { subscriptionId: sub.id, pixQrCode: { encodedImage: qr.encodedImage, payload: qr.payload } };
  }

  async createCardSubscription(input: {
    customerId: string; value: number; cycle: 'MONTHLY' | 'YEARLY'; description: string;
    card: CardInput; holderInfo: CardHolderInfo; holder: { name: string; email: string; cpfCnpj: string }; remoteIp: string;
  }): Promise<{ subscriptionId: string; status: 'ACTIVE' | 'PENDING'; cardLast4: string | null; cardBrand: string | null }> {
    let sub: { id: string; creditCard?: { creditCardNumber?: string; creditCardBrand?: string } };
    try {
      sub = await this.call('/subscriptions', {
        method: 'POST',
        body: {
          customer: input.customerId, billingType: 'CREDIT_CARD', value: input.value, cycle: input.cycle,
          nextDueDate: this.todaySaoPaulo(), description: input.description,
          creditCard: {
            holderName: input.card.holderName, number: input.card.number,
            expiryMonth: input.card.expiryMonth, expiryYear: input.card.expiryYear, ccv: input.card.ccv,
          },
          creditCardHolderInfo: {
            name: input.holder.name, email: input.holder.email, cpfCnpj: input.holder.cpfCnpj,
            postalCode: input.holderInfo.postalCode, addressNumber: input.holderInfo.addressNumber, phone: input.holderInfo.phone,
          },
          remoteIp: input.remoteIp,
        },
      });
    } catch (e) {
      if (e instanceof AsaasRequestError && e.status >= 400 && e.status < 500) {
        throw new UnprocessableEntityException({ code: 'CARD_DECLINED', message: 'Cartão recusado. Confira os dados ou tente outro cartão.' });
      }
      throw new BadGatewayException('Falha ao falar com o Asaas');
    }
    const payments = await this.callOrGateway<{ data: { status: string }[] }>(`/subscriptions/${sub.id}/payments`, { method: 'GET' });
    const st = payments.data[0]?.status;
    const status: 'ACTIVE' | 'PENDING' = st === 'CONFIRMED' || st === 'RECEIVED' ? 'ACTIVE' : 'PENDING';
    return { subscriptionId: sub.id, status, cardLast4: sub.creditCard?.creditCardNumber ?? null, cardBrand: sub.creditCard?.creditCardBrand ?? null };
  }

  async updateSubscriptionBilling(subscriptionId: string, input: {
    method: PaymentMethod; card?: CardInput; holderInfo?: CardHolderInfo; holder?: { name: string; email: string; cpfCnpj: string }; remoteIp?: string;
  }): Promise<{ cardLast4: string | null; cardBrand: string | null }> {
    if (input.method === 'PIX') {
      await this.callOrGateway(`/subscriptions/${subscriptionId}`, { method: 'POST', body: { billingType: 'PIX' } });
      return { cardLast4: null, cardBrand: null };
    }
    let updated: { creditCard?: { creditCardNumber?: string; creditCardBrand?: string } };
    try {
      updated = await this.call(`/subscriptions/${subscriptionId}`, {
        method: 'POST',
        body: {
          billingType: 'CREDIT_CARD',
          creditCard: input.card && {
            holderName: input.card.holderName, number: input.card.number,
            expiryMonth: input.card.expiryMonth, expiryYear: input.card.expiryYear, ccv: input.card.ccv,
          },
          creditCardHolderInfo: input.holder && input.holderInfo && {
            name: input.holder.name, email: input.holder.email, cpfCnpj: input.holder.cpfCnpj,
            postalCode: input.holderInfo.postalCode, addressNumber: input.holderInfo.addressNumber, phone: input.holderInfo.phone,
          },
          remoteIp: input.remoteIp,
        },
      });
    } catch (e) {
      if (e instanceof AsaasRequestError && e.status >= 400 && e.status < 500) {
        throw new UnprocessableEntityException({ code: 'CARD_DECLINED', message: 'Cartão recusado. Confira os dados ou tente outro cartão.' });
      }
      throw new BadGatewayException('Falha ao falar com o Asaas');
    }
    return { cardLast4: updated.creditCard?.creditCardNumber ?? null, cardBrand: updated.creditCard?.creditCardBrand ?? null };
  }
```

Remover o antigo `createSubscription` (invoiceUrl).

- [ ] **Step 3: Rodar teste + tsc**

Run: `pnpm --filter @nutri-plus/api test asaas.service && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: PASS + tsc limpo (nota: `subscription.service.ts` ainda referencia `createSubscription` — será corrigido na Task 4; se o tsc ripar aqui, ok, mas rode o teste do asaas isolado que deve passar).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/billing/asaas.service.ts apps/api/src/billing/asaas.service.spec.ts
git commit -m "feat(api): AsaasService transparente (Pix QR + cartão + updateBilling)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: SubscriptionService.checkout método-consciente + DTO + controller

**Files:**
- Modify: `apps/api/src/billing/dto/checkout.dto.ts`
- Modify: `apps/api/src/billing/subscription.service.ts` (`checkout`)
- Modify: `apps/api/src/billing/me-subscription.controller.ts` (`@Ip`, holder)
- Modify: `apps/api/src/main.ts` (`trust proxy`)
- Test: `apps/api/src/billing/subscription.service.spec.ts` (estender)

**Interfaces:**
- Consumes: `AsaasService.createPixSubscription/createCardSubscription` (Task 3).
- Produces: `checkout(nutritionistId, dto: CheckoutRequest, customer: { name; email }, remoteIp: string): Promise<CheckoutResponse>`.

- [ ] **Step 1: DTO com método + cartão aninhado**

Reescrever `checkout.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsIn, IsObject, IsString, Matches, ValidateIf, ValidateNested } from 'class-validator';
import type { BillingPeriod, CardHolderInfo, CardInput, PaymentMethod, PlanTier } from '@nutri-plus/shared-types';

export class CardDto implements CardInput {
  @IsString() holderName!: string;
  @Matches(/^\d{13,19}$/, { message: 'número de cartão inválido' }) number!: string;
  @Matches(/^\d{2}$/) expiryMonth!: string;
  @Matches(/^\d{4}$/) expiryYear!: string;
  @Matches(/^\d{3,4}$/) ccv!: string;
}

export class HolderInfoDto implements CardHolderInfo {
  @Matches(/^\d{8}$/, { message: 'CEP deve ter 8 dígitos' }) postalCode!: string;
  @IsString() addressNumber!: string;
  @Matches(/^\d{10,11}$/, { message: 'telefone inválido' }) phone!: string;
}

export class CheckoutDto {
  @IsIn(['ESSENCIAL', 'PRO']) plan!: PlanTier;
  @IsIn(['MONTHLY', 'YEARLY']) period!: BillingPeriod;
  @IsString() @Matches(/^\d{11}$|^\d{14}$/, { message: 'cpfCnpj deve ter 11 (CPF) ou 14 (CNPJ) dígitos' }) cpfCnpj!: string;
  @IsIn(['PIX', 'CREDIT_CARD']) method!: PaymentMethod;

  @ValidateIf((o) => o.method === 'CREDIT_CARD')
  @IsObject() @ValidateNested() @Type(() => CardDto) card?: CardDto;

  @ValidateIf((o) => o.method === 'CREDIT_CARD')
  @IsObject() @ValidateNested() @Type(() => HolderInfoDto) holderInfo?: HolderInfoDto;
}
```

- [ ] **Step 2: Estender o teste do service (falha primeiro)**

Adicionar ao `subscription.service.spec.ts` (o helper `deps` já mocka prisma/entitlements/asaas — estender o mock `asaas` com os novos métodos):

```ts
it('checkout PIX cria assinatura Pix, grava onboarding/método e retorna o QR (status intacto)', async () => {
  const { svc, prisma, asaas } = deps({ id: 's1', nutritionistId: 'n1', asaasCustomerId: 'cus_1', asaasSubscriptionId: null });
  asaas.createPixSubscription = jest.fn().mockResolvedValue({ subscriptionId: 'sub_1', pixQrCode: { encodedImage: 'B64', payload: 'p' } });
  const out = await svc.checkout('n1', { plan: 'ESSENCIAL', period: 'MONTHLY', cpfCnpj: '12345678901', method: 'PIX' }, { name: 'A', email: 'a@x.com' }, '1.2.3.4');
  expect(out).toEqual({ method: 'PIX', pixQrCode: { encodedImage: 'B64', payload: 'p' } });
  expect(prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ asaasSubscriptionId: 'sub_1', plan: 'ESSENCIAL', paymentMethod: 'PIX', onboardedAt: expect.any(Date) }),
  }));
  // Pix não vira ACTIVE aqui:
  expect(prisma.subscription.update.mock.calls[0][0].data.status).toBeUndefined();
});

it('checkout CARTÃO confirmado vira ACTIVE na hora + grava last4/brand', async () => {
  const { svc, prisma, asaas } = deps({ id: 's1', nutritionistId: 'n1', asaasCustomerId: 'cus_1', asaasSubscriptionId: null });
  asaas.createCardSubscription = jest.fn().mockResolvedValue({ subscriptionId: 'sub_2', status: 'ACTIVE', cardLast4: '1234', cardBrand: 'VISA' });
  const out = await svc.checkout('n1', {
    plan: 'PRO', period: 'MONTHLY', cpfCnpj: '12345678901', method: 'CREDIT_CARD',
    card: { holderName: 'A B', number: '4111111111111111', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
    holderInfo: { postalCode: '01310000', addressNumber: '100', phone: '11999999999' },
  }, { name: 'A B', email: 'a@x.com' }, '1.2.3.4');
  expect(out).toEqual({ method: 'CREDIT_CARD', status: 'ACTIVE' });
  const data = prisma.subscription.update.mock.calls[0][0].data;
  expect(data).toMatchObject({ status: 'ACTIVE', paymentMethod: 'CREDIT_CARD', cardLast4: '1234', cardBrand: 'VISA', plan: 'PRO' });
  expect(data.currentPeriodEnd).toBeInstanceOf(Date);
  expect(asaas.createCardSubscription).toHaveBeenCalledWith(expect.objectContaining({ remoteIp: '1.2.3.4', holder: { name: 'A B', email: 'a@x.com', cpfCnpj: '12345678901' } }));
});
```

Run: `pnpm --filter @nutri-plus/api test subscription.service`
Expected: FAIL.

- [ ] **Step 3: Reescrever `checkout`**

Substituir o método `checkout` no `subscription.service.ts` (importar `CheckoutResponse`, `PaymentMethod` de shared-types; usar o `nextPeriodEnd` já existente):

```ts
  async checkout(
    nutritionistId: string,
    dto: CheckoutRequest,
    customer: { name: string; email: string },
    remoteIp: string,
  ): Promise<CheckoutResponse> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub) throw new NotFoundException('Assinatura não encontrada');

    let customerId = sub.asaasCustomerId;
    if (!customerId) {
      customerId = await this.asaas.ensureCustomer({ ...customer, cpfCnpj: dto.cpfCnpj });
    }
    if (sub.asaasSubscriptionId) {
      await this.asaas.cancelSubscription(sub.asaasSubscriptionId); // troca de plano
    }

    const cfg = PLAN_CATALOG[dto.plan];
    const value = dto.period === 'MONTHLY' ? cfg.monthlyBrl : cfg.yearlyBrl;
    const base = {
      asaasCustomerId: customerId, plan: dto.plan, billingPeriod: dto.period,
      cancelAtPeriodEnd: false, onboardedAt: new Date(),
    };

    if (dto.method === 'PIX') {
      const { subscriptionId, pixQrCode } = await this.asaas.createPixSubscription({
        customerId, value, cycle: dto.period, description: `nutri_plus ${dto.plan}`,
      });
      await this.prisma.subscription.update({
        where: { nutritionistId },
        data: { ...base, asaasSubscriptionId: subscriptionId, paymentMethod: 'PIX', cardLast4: null, cardBrand: null },
      });
      return { method: 'PIX', pixQrCode };
    }

    // CREDIT_CARD (o DTO garante card/holderInfo presentes)
    const { subscriptionId, status, cardLast4, cardBrand } = await this.asaas.createCardSubscription({
      customerId, value, cycle: dto.period, description: `nutri_plus ${dto.plan}`,
      card: dto.card!, holderInfo: dto.holderInfo!,
      holder: { name: customer.name, email: customer.email, cpfCnpj: dto.cpfCnpj }, remoteIp,
    });
    await this.prisma.subscription.update({
      where: { nutritionistId },
      data: {
        ...base, asaasSubscriptionId: subscriptionId, paymentMethod: 'CREDIT_CARD', cardLast4, cardBrand,
        ...(status === 'ACTIVE' ? { status: 'ACTIVE', currentPeriodEnd: this.nextPeriodEnd(dto.period, undefined) } : {}),
      },
    });
    return { method: 'CREDIT_CARD', status };
  }
```

- [ ] **Step 4: Controller passa `@Ip()` + main.ts trust proxy**

Em `me-subscription.controller.ts`, no `checkout`, adicionar `@Ip() ip: string` e repassar:

```ts
  @Post('checkout')
  checkout(@CurrentUser() ctx: AuthContext, @Body() dto: CheckoutDto, @Ip() ip: string): Promise<CheckoutResponse> {
    return this.subscription.checkout(resolveScopeNutritionistId(ctx), dto, { name: ctx.name, email: ctx.email }, ip);
  }
```
(importar `Ip` de `@nestjs/common`.) Em `main.ts`, após criar o app, adicionar `app.set('trust proxy', true);` (via `app.getHttpAdapter().getInstance().set('trust proxy', true)` se necessário) para que `@Ip()` retorne o IP real atrás do proxy.

- [ ] **Step 5: Rodar teste + tsc**

Run: `pnpm --filter @nutri-plus/api test subscription.service && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: PASS + tsc limpo (o `createSubscription` removido não é mais referenciado).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/billing/dto/checkout.dto.ts apps/api/src/billing/subscription.service.ts apps/api/src/billing/subscription.service.spec.ts apps/api/src/billing/me-subscription.controller.ts apps/api/src/main.ts
git commit -m "feat(api): checkout transparente (Pix/cartão) método-consciente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: startTrial + updatePaymentMethod + getView novos campos

**Files:**
- Create: `apps/api/src/billing/dto/payment-method.dto.ts`
- Modify: `apps/api/src/billing/subscription.service.ts` (`startTrial`, `updatePaymentMethod`, `getView`)
- Modify: `apps/api/src/billing/me-subscription.controller.ts` (rotas `start-trial`, `payment-method`)
- Test: `apps/api/src/billing/subscription.service.spec.ts` (estender)

**Interfaces:**
- Consumes: `TRIAL_DAYS` (`plan-policy`), `AsaasService.updateSubscriptionBilling`.
- Produces: `startTrial(nutritionistId): Promise<void>`; `updatePaymentMethod(nutritionistId, dto: PaymentMethodRequest, customer, remoteIp): Promise<void>`; `getView` retorna `onboardedAt/paymentMethod/cardLast4/cardBrand`.

- [ ] **Step 1: DTO de payment-method**

```ts
// apps/api/src/billing/dto/payment-method.dto.ts
import { Type } from 'class-transformer';
import { IsIn, IsObject, IsString, Matches, ValidateIf, ValidateNested } from 'class-validator';
import type { PaymentMethod } from '@nutri-plus/shared-types';
import { CardDto, HolderInfoDto } from './checkout.dto';

export class PaymentMethodDto {
  @IsIn(['PIX', 'CREDIT_CARD']) method!: PaymentMethod;
  // CPF só é exigido ao (re)tokenizar cartão; mudar p/ Pix não precisa dele.
  @ValidateIf((o) => o.method === 'CREDIT_CARD')
  @IsString() @Matches(/^\d{11}$|^\d{14}$/, { message: 'cpfCnpj deve ter 11 ou 14 dígitos' }) cpfCnpj?: string;
  @ValidateIf((o) => o.method === 'CREDIT_CARD') @IsObject() @ValidateNested() @Type(() => CardDto) card?: CardDto;
  @ValidateIf((o) => o.method === 'CREDIT_CARD') @IsObject() @ValidateNested() @Type(() => HolderInfoDto) holderInfo?: HolderInfoDto;
}
```
*(Nota: `PaymentMethodRequest.cpfCnpj` no shared-types fica opcional pra bater com isto — ajuste a Task 1 pra `cpfCnpj?: string`. No `updatePaymentMethod`, ao mudar p/ Pix, `customer.cpfCnpj` pode ser `''`/undefined — o `updateSubscriptionBilling` PIX não usa CPF.)*

- [ ] **Step 2: Teste (falha primeiro)**

```ts
it('startTrial seta trialEndsAt (+7d) e onboardedAt, status TRIALING', async () => {
  const { svc, prisma } = deps({ id: 's1', nutritionistId: 'n1' });
  await svc.startTrial('n1');
  const data = prisma.subscription.update.mock.calls[0][0].data;
  const days = (data.trialEndsAt.getTime() - Date.now()) / 86400000;
  expect(days).toBeGreaterThan(6.9); expect(days).toBeLessThan(7.1);
  expect(data).toMatchObject({ status: 'TRIALING', onboardedAt: expect.any(Date) });
});

it('updatePaymentMethod troca para cartão e grava last4/brand', async () => {
  const { svc, prisma, asaas } = deps({ id: 's1', nutritionistId: 'n1', asaasSubscriptionId: 'sub_1' });
  asaas.updateSubscriptionBilling = jest.fn().mockResolvedValue({ cardLast4: '9999', cardBrand: 'VISA' });
  await svc.updatePaymentMethod('n1', {
    method: 'CREDIT_CARD',
    card: { holderName: 'A', number: '4111111111111111', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
    holderInfo: { postalCode: '01310000', addressNumber: '1', phone: '11999999999' },
  }, { name: 'A', email: 'a@x.com', cpfCnpj: '12345678901' }, '1.2.3.4');
  expect(asaas.updateSubscriptionBilling).toHaveBeenCalledWith('sub_1', expect.objectContaining({ method: 'CREDIT_CARD', remoteIp: '1.2.3.4' }));
  expect(prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paymentMethod: 'CREDIT_CARD', cardLast4: '9999', cardBrand: 'VISA' }) }));
});

it('getView expõe onboardedAt/paymentMethod/cardLast4/cardBrand', async () => {
  const { svc } = deps({ id: 's1', nutritionistId: 'n1', status: 'ACTIVE', onboardedAt: new Date(), paymentMethod: 'CREDIT_CARD', cardLast4: '1234', cardBrand: 'VISA' });
  const view = await svc.getView('n1');
  expect(view).toMatchObject({ paymentMethod: 'CREDIT_CARD', cardLast4: '1234', cardBrand: 'VISA' });
  expect(view.onboardedAt).toEqual(expect.any(String));
});
```
*(Estender o helper `deps` p/ aceitar os novos campos do `sub` e o mock `subscriptionPayment.findMany` já existe.)*

Run: `pnpm --filter @nutri-plus/api test subscription.service`
Expected: FAIL.

- [ ] **Step 3: Implementar no service**

Importar `TRIAL_DAYS` de `./plan-policy` e `PaymentMethodRequest` de shared-types. Adicionar:

```ts
  async startTrial(nutritionistId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub) throw new NotFoundException('Assinatura não encontrada');
    await this.prisma.subscription.update({
      where: { nutritionistId },
      data: { status: 'TRIALING', trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000), onboardedAt: new Date() },
    });
  }

  async updatePaymentMethod(
    nutritionistId: string,
    dto: PaymentMethodRequest,
    customer: { name: string; email: string; cpfCnpj: string },
    remoteIp: string,
  ): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub?.asaasSubscriptionId) throw new NotFoundException('Assinatura ativa não encontrada');
    const { cardLast4, cardBrand } = await this.asaas.updateSubscriptionBilling(sub.asaasSubscriptionId, {
      method: dto.method, card: dto.card, holderInfo: dto.holderInfo,
      holder: { name: customer.name, email: customer.email, cpfCnpj: customer.cpfCnpj }, remoteIp,
    });
    await this.prisma.subscription.update({
      where: { nutritionistId },
      data: { paymentMethod: dto.method, cardLast4, cardBrand },
    });
  }
```
No `getView`, adicionar ao objeto retornado: `onboardedAt: sub.onboardedAt?.toISOString() ?? null, paymentMethod: (sub.paymentMethod as PaymentMethod | null), cardLast4: sub.cardLast4, cardBrand: sub.cardBrand,`.

**Nota (cpfCnpj no update):** o `updatePaymentMethod` precisa do CPF do titular pro Asaas. O `AuthContext` não carrega CPF. Solução: o `PaymentMethodDto` inclui `cpfCnpj` (mesmo `@Matches` do checkout) e o controller passa `dto.cpfCnpj` como `customer.cpfCnpj`. Adicione `cpfCnpj` ao `PaymentMethodDto` e ao `PaymentMethodRequest` (shared-types) — atualize a Task 1 mentalmente: `PaymentMethodRequest` ganha `cpfCnpj: string`.

- [ ] **Step 4: Rotas no controller**

```ts
  @Post('start-trial')
  async startTrial(@CurrentUser() ctx: AuthContext): Promise<{ ok: true }> {
    await this.subscription.startTrial(resolveScopeNutritionistId(ctx));
    return { ok: true };
  }

  @Post('payment-method')
  async updatePaymentMethod(@CurrentUser() ctx: AuthContext, @Body() dto: PaymentMethodDto, @Ip() ip: string): Promise<{ ok: true }> {
    await this.subscription.updatePaymentMethod(resolveScopeNutritionistId(ctx), dto, { name: ctx.name, email: ctx.email, cpfCnpj: dto.cpfCnpj ?? '' }, ip);
    return { ok: true };
  }
```

- [ ] **Step 5: Rodar teste + tsc**

Run: `pnpm --filter @nutri-plus/api test subscription.service && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: PASS + tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/billing/dto/payment-method.dto.ts apps/api/src/billing/subscription.service.ts apps/api/src/billing/subscription.service.spec.ts apps/api/src/billing/me-subscription.controller.ts packages/shared-types/src/v1/billing.ts
git commit -m "feat(api): start-trial + gerenciar método de pagamento + getView estendido

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Signup — trial começa no clique (não no signup)

**Files:**
- Modify: `apps/api/src/users/users.service.ts` (`createNutritionist`)
- Test: `apps/api/src/users/users.service.spec.ts` (ajustar)

**Interfaces:**
- Produces: signup cria `Subscription { status: 'TRIALING', trialEndsAt: null, onboardedAt: null }`.

- [ ] **Step 1: Ajustar o teste (falha primeiro)**

No `users.service.spec.ts`, o teste que hoje afirma `trialEndsAt ~ +7d` passa a afirmar que **não** há trial iniciado:

```ts
it('createWithProfile(NUTRITIONIST) cria assinatura TRIALING sem trial iniciado (trialEndsAt null)', async () => {
  const create = jest.fn().mockResolvedValue({ id: 'u1' });
  const prisma = { user: { create } } as any;
  await new UsersService(prisma).createWithProfile({ authProviderId: 'a1', email: 'n@x.com', name: 'N', role: 'NUTRITIONIST' as any });
  const data = create.mock.calls[0][0].data.nutritionistProfile.create.subscription.create;
  expect(data.status).toBe('TRIALING');
  expect(data.trialEndsAt ?? null).toBeNull();
});
```

Run: `pnpm --filter @nutri-plus/api test users.service`
Expected: FAIL.

- [ ] **Step 2: Remover o trialEndsAt do nested create**

Em `createNutritionist`, trocar a criação da assinatura para não iniciar o trial:

```ts
                subscription: {
                  create: { status: 'TRIALING' },
                },
```
Remover o import não usado `TRIAL_DAYS` se ficar órfão.

- [ ] **Step 3: Rodar teste + tsc**

Run: `pnpm --filter @nutri-plus/api test users.service && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: PASS + tsc limpo.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.service.spec.ts
git commit -m "feat(api): trial passa a começar na escolha do usuário, não no signup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Web — camada de dados (checkout união + start-trial + payment-method)

**Files:**
- Modify: `apps/web/src/lib/api/subscription.ts`
- Test: `apps/web/src/lib/api/subscription.test.ts` (criar, mínimo)

**Interfaces:**
- Consumes: `CheckoutRequest`, `CheckoutResponse`, `PaymentMethodRequest`, `SubscriptionView` (shared-types); `browserApiFetch`.
- Produces: `checkoutSubscription(body): Promise<CheckoutResponse>` (união), `startTrial(): Promise<{ ok: true }>`, `updatePaymentMethod(body): Promise<{ ok: true }>`.

- [ ] **Step 1: Estender o client**

```ts
// apps/web/src/lib/api/subscription.ts
import type { CheckoutRequest, CheckoutResponse, PaymentMethodRequest, SubscriptionView } from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function getSubscription(): Promise<SubscriptionView> {
  return browserApiFetch<SubscriptionView>('/me/subscription');
}
export function checkoutSubscription(body: CheckoutRequest): Promise<CheckoutResponse> {
  return browserApiFetch<CheckoutResponse>('/me/subscription/checkout', { method: 'POST', body });
}
export function startTrial(): Promise<{ ok: true }> {
  return browserApiFetch<{ ok: true }>('/me/subscription/start-trial', { method: 'POST' });
}
export function updatePaymentMethod(body: PaymentMethodRequest): Promise<{ ok: true }> {
  return browserApiFetch<{ ok: true }>('/me/subscription/payment-method', { method: 'POST', body });
}
export function cancelSubscription(): Promise<{ ok: true }> {
  return browserApiFetch<{ ok: true }>('/me/subscription/cancel', { method: 'POST' });
}
```

- [ ] **Step 2: Teste mínimo (paths corretos)**

```ts
// apps/web/src/lib/api/subscription.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const fetchMock = vi.fn();
vi.mock('@/lib/api/browser', () => ({ browserApiFetch: (...a: any[]) => fetchMock(...a) }));
import { startTrial, updatePaymentMethod, checkoutSubscription } from './subscription';

beforeEach(() => { fetchMock.mockReset().mockResolvedValue({ ok: true }); });

describe('subscription api', () => {
  it('startTrial → POST /me/subscription/start-trial', async () => {
    await startTrial();
    expect(fetchMock).toHaveBeenCalledWith('/me/subscription/start-trial', { method: 'POST' });
  });
  it('updatePaymentMethod → POST /me/subscription/payment-method', async () => {
    await updatePaymentMethod({ method: 'PIX', cpfCnpj: '12345678901' } as any);
    expect(fetchMock).toHaveBeenCalledWith('/me/subscription/payment-method', { method: 'POST', body: { method: 'PIX', cpfCnpj: '12345678901' } });
  });
  it('checkoutSubscription → POST /me/subscription/checkout', async () => {
    await checkoutSubscription({ plan: 'PRO', period: 'MONTHLY', cpfCnpj: '12345678901', method: 'PIX' });
    expect(fetchMock).toHaveBeenCalledWith('/me/subscription/checkout', { method: 'POST', body: expect.objectContaining({ method: 'PIX' }) });
  });
});
```

Run: `pnpm --filter @nutri-plus/web test lib/api/subscription`
Expected: FAIL → PASS após o Step 1.

- [ ] **Step 3: tsc**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: limpo (`PaymentMethodRequest` inclui `cpfCnpj`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api/subscription.ts apps/web/src/lib/api/subscription.test.ts
git commit -m "feat(web): client de checkout (união) + start-trial + payment-method

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Web — PlanPicker redesenhado + componentes Pix e Cartão

**Files:**
- Modify: `apps/web/src/components/billing/plan-picker.tsx`
- Create: `apps/web/src/components/billing/pix-payment.tsx`
- Create: `apps/web/src/components/billing/card-form.tsx`
- Test: `apps/web/src/components/billing/plan-picker.test.tsx`, `card-form.test.tsx`

**Interfaces:**
- Consumes: `PLAN_CATALOG`, `PlanTier`, `BillingPeriod`, `PixQrCode`, `CardInput`, `CardHolderInfo` (shared-types).
- Produces: `PlanPicker({ onChoose })` (redesenho); `PixPayment({ pixQrCode })`; `CardForm({ onSubmit, loading, error })` onde `onSubmit(card: CardInput, holderInfo: CardHolderInfo, cpfCnpj: string)`.

- [ ] **Step 1: Redesenhar PlanPicker (teste primeiro)**

```tsx
// apps/web/src/components/billing/plan-picker.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanPicker } from './plan-picker';

it('mostra os dois planos, destaca o Pro e troca preço no toggle anual', () => {
  const onChoose = vi.fn();
  render(<PlanPicker onChoose={onChoose} />);
  expect(screen.getByText('Essencial')).toBeInTheDocument();
  expect(screen.getByText('Pro')).toBeInTheDocument();
  expect(screen.getByText(/mais popular/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /anual/i }));
  expect(screen.getByText(/R\$\s?990/)).toBeInTheDocument(); // Pro anual
  fireEvent.click(screen.getAllByRole('button', { name: /assinar/i })[1]);
  expect(onChoose).toHaveBeenCalledWith('PRO', 'YEARLY');
});
```
Run: `pnpm --filter @nutri-plus/web test plan-picker` → FAIL.

Implementar o redesenho (cards responsivos, Pro com selo "Mais popular", lista de benefícios com ✓, toggle mensal/anual com selo "2 meses grátis", preço grande). Estrutura:

```tsx
'use client';
import { useState } from 'react';
import type { BillingPeriod, PlanTier } from '@nutri-plus/shared-types';
import { PLAN_CATALOG } from '@nutri-plus/shared-types';

const TIERS: PlanTier[] = ['ESSENCIAL', 'PRO'];
const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR')}`;

export function PlanPicker({ onChoose }: { onChoose: (plan: PlanTier, period: BillingPeriod) => void }) {
  const [period, setPeriod] = useState<BillingPeriod>('MONTHLY');
  return (
    <div className="space-y-6">
      <div className="mx-auto flex w-fit items-center gap-1 rounded-full border p-1 text-sm">
        <button aria-pressed={period === 'MONTHLY'} onClick={() => setPeriod('MONTHLY')}
          className={`rounded-full px-4 py-1 ${period === 'MONTHLY' ? 'bg-primary text-primary-foreground' : ''}`}>Mensal</button>
        <button aria-pressed={period === 'YEARLY'} onClick={() => setPeriod('YEARLY')}
          className={`rounded-full px-4 py-1 ${period === 'YEARLY' ? 'bg-primary text-primary-foreground' : ''}`}>
          Anual <span className="text-xs opacity-80">2 meses grátis</span>
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {TIERS.map((tier) => {
          const cfg = PLAN_CATALOG[tier];
          const price = period === 'MONTHLY' ? cfg.monthlyBrl : cfg.yearlyBrl;
          const pro = tier === 'PRO';
          return (
            <div key={tier} className={`relative rounded-2xl border p-6 flex flex-col gap-4 ${pro ? 'border-primary shadow-lg ring-1 ring-primary/20' : ''}`}>
              {pro && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">Mais popular</span>}
              <div>
                <h3 className="text-xl font-bold">{pro ? 'Pro' : 'Essencial'}</h3>
                <p className="mt-1 text-3xl font-extrabold">{brl(price)}<span className="text-sm font-medium text-muted-foreground">/{period === 'MONTHLY' ? 'mês' : 'ano'}</span></p>
              </div>
              <ul className="space-y-2 text-sm">
                <li>✓ Pacientes ilimitados, planos, bioimpedância, agenda</li>
                <li>✓ <strong>{cfg.aiActionsPerMonth}</strong> ações de IA/mês</li>
                <li>{cfg.features.includes('silhueta') ? '✓' : '—'} Silhueta (IA)</li>
                <li>{cfg.features.includes('transcription') ? '✓' : '—'} Transcrição de consulta</li>
                <li>{cfg.employeeSeats > 0 ? `✓ Até ${cfg.employeeSeats} funcionários` : '— Sem funcionários'}</li>
              </ul>
              <button className={`mt-auto w-full rounded-lg py-2.5 text-sm font-semibold ${pro ? 'bg-primary text-primary-foreground' : 'border'}`}
                onClick={() => onChoose(tier, period)}>Assinar {pro ? 'Pro' : 'Essencial'}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```
Run: `pnpm --filter @nutri-plus/web test plan-picker` → PASS.

- [ ] **Step 2: PixPayment (display do QR)**

```tsx
// apps/web/src/components/billing/pix-payment.tsx
'use client';
import { useState } from 'react';
import type { PixQrCode } from '@nutri-plus/shared-types';

export function PixPayment({ pixQrCode }: { pixQrCode: PixQrCode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mx-auto max-w-sm space-y-4 text-center">
      <img src={`data:image/png;base64,${pixQrCode.encodedImage}`} alt="QR Code Pix" className="mx-auto h-56 w-56 rounded-lg border" />
      <button className="w-full rounded-lg border px-3 py-2 text-sm break-all"
        onClick={() => { navigator.clipboard.writeText(pixQrCode.payload); setCopied(true); }}>
        {copied ? 'Copiado!' : 'Copiar código Pix'}
      </button>
      <p className="text-sm text-muted-foreground">Aguardando pagamento… assim que confirmar, você entra automaticamente.</p>
    </div>
  );
}
```

- [ ] **Step 3: CardForm (teste primeiro)**

```tsx
// apps/web/src/components/billing/card-form.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardForm } from './card-form';

it('normaliza e envia os dados do cartão', () => {
  const onSubmit = vi.fn();
  render(<CardForm onSubmit={onSubmit} loading={false} error={null} />);
  fireEvent.change(screen.getByLabelText(/número do cartão/i), { target: { value: '5162 3062 1937 8829' } });
  fireEvent.change(screen.getByLabelText(/nome no cartão/i), { target: { value: 'Teste Sandbox' } });
  fireEvent.change(screen.getByLabelText(/validade/i), { target: { value: '12/2030' } });
  fireEvent.change(screen.getByLabelText(/cvv/i), { target: { value: '123' } });
  fireEvent.change(screen.getByLabelText(/^cpf/i), { target: { value: '123.456.789-01' } });
  fireEvent.change(screen.getByLabelText(/cep/i), { target: { value: '01310-000' } });
  fireEvent.change(screen.getByLabelText(/número.*endereço/i), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText(/telefone/i), { target: { value: '(11) 99999-9999' } });
  fireEvent.click(screen.getByRole('button', { name: /pagar/i }));
  expect(onSubmit).toHaveBeenCalledWith(
    { holderName: 'Teste Sandbox', number: '5162306219378829', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
    { postalCode: '01310000', addressNumber: '100', phone: '11999999999' },
    '12345678901',
  );
});
```
Run: `pnpm --filter @nutri-plus/web test card-form` → FAIL.

Implementar `CardForm` — campos controlados, normaliza dígitos, parse de validade `MM/AAAA`, chama `onSubmit(card, holderInfo, cpfCnpj)`; recebe `loading`/`error` p/ estado. (Rótulos exatos como no teste: "Número do cartão", "Nome no cartão", "Validade", "CVV", "CPF", "CEP", "Número (endereço)", "Telefone", botão "Pagar".) Estrutura:

```tsx
'use client';
import { useState } from 'react';
import type { CardHolderInfo, CardInput } from '@nutri-plus/shared-types';

export function CardForm({ onSubmit, loading, error }: {
  onSubmit: (card: CardInput, holderInfo: CardHolderInfo, cpfCnpj: string) => void;
  loading: boolean; error: string | null;
}) {
  const [f, setF] = useState({ number: '', holderName: '', expiry: '', ccv: '', cpf: '', cep: '', addressNumber: '', phone: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const d = (s: string) => s.replace(/\D/g, '');
  function submit() {
    const [mm, yyyy] = f.expiry.split('/').map((s) => s.trim());
    onSubmit(
      { holderName: f.holderName.trim(), number: d(f.number), expiryMonth: mm ?? '', expiryYear: yyyy ?? '', ccv: d(f.ccv) },
      { postalCode: d(f.cep), addressNumber: f.addressNumber.trim(), phone: d(f.phone) },
      d(f.cpf),
    );
  }
  const Input = (label: string, k: keyof typeof f, ph?: string) => (
    <label className="block text-sm">{label}
      <input aria-label={label} className="mt-1 w-full rounded border px-3 py-2" value={f[k]} onChange={set(k)} placeholder={ph} />
    </label>
  );
  return (
    <div className="mx-auto max-w-sm space-y-3">
      {Input('Número do cartão', 'number')}
      {Input('Nome no cartão', 'holderName')}
      <div className="grid grid-cols-2 gap-3">{Input('Validade', 'expiry', 'MM/AAAA')}{Input('CVV', 'ccv')}</div>
      {Input('CPF', 'cpf')}
      <div className="grid grid-cols-2 gap-3">{Input('CEP', 'cep')}{Input('Número (endereço)', 'addressNumber')}</div>
      {Input('Telefone', 'phone')}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={loading} onClick={submit}>
        {loading ? 'Processando…' : 'Pagar'}
      </button>
    </div>
  );
}
```
Run: `pnpm --filter @nutri-plus/web test card-form` → PASS.

- [ ] **Step 4: tsc + commit**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`

```bash
git add apps/web/src/components/billing/plan-picker.tsx apps/web/src/components/billing/plan-picker.test.tsx apps/web/src/components/billing/pix-payment.tsx apps/web/src/components/billing/card-form.tsx apps/web/src/components/billing/card-form.test.tsx
git commit -m "feat(web): PlanPicker redesenhado + componentes de pagamento Pix/cartão

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Web — route group (checkout) sem sidebar + AssinaturaPage + onboarding gate

**Files:**
- Create: `apps/web/src/app/(checkout)/layout.tsx`
- Create: `apps/web/src/app/(checkout)/assinatura/page.tsx`
- Delete: `apps/web/src/app/(app)/assinatura/page.tsx`
- Create: `apps/web/src/components/billing/onboarding-gate.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx` (montar `<OnboardingGate/>`)
- Test: `apps/web/src/app/(checkout)/assinatura/page.test.tsx`, `apps/web/src/components/billing/onboarding-gate.test.tsx`

**Interfaces:**
- Consumes: `PlanPicker`, `PixPayment`, `CardForm` (Task 8); `checkoutSubscription`, `startTrial`, `getSubscription`, `SUBSCRIPTION_KEY` (Task 7); `useSubscription`.

- [ ] **Step 1: Layout minimalista (checkout)**

```tsx
// apps/web/src/app/(checkout)/layout.tsx
import { Logo } from '@/components/brand/logo';

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex justify-center border-b p-4"><Logo variant="full" className="h-7" /></header>
      <main className="mx-auto max-w-3xl px-4 py-8 md:py-12">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: OnboardingGate (teste primeiro)**

```tsx
// apps/web/src/components/billing/onboarding-gate.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }), usePathname: () => '/' }));
const useSubscription = vi.fn();
vi.mock('@/lib/queries/subscription', () => ({ useSubscription: () => useSubscription() }));
import { OnboardingGate } from './onboarding-gate';

beforeEach(() => replace.mockClear());
it('redireciona pra /assinatura quando onboardedAt é null', () => {
  useSubscription.mockReturnValue({ data: { onboardedAt: null } });
  render(<OnboardingGate />);
  expect(replace).toHaveBeenCalledWith('/assinatura');
});
it('não redireciona quando já fez onboarding', () => {
  useSubscription.mockReturnValue({ data: { onboardedAt: '2026-08-01T00:00:00Z' } });
  render(<OnboardingGate />);
  expect(replace).not.toHaveBeenCalled();
});
```
Run: `pnpm --filter @nutri-plus/web test onboarding-gate` → FAIL.

```tsx
// apps/web/src/components/billing/onboarding-gate.tsx
'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSubscription } from '@/lib/queries/subscription';

export function OnboardingGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { data } = useSubscription();
  useEffect(() => {
    if (data && data.onboardedAt === null && pathname !== '/assinatura') router.replace('/assinatura');
  }, [data, pathname, router]);
  return null;
}
```
Montar em `app/(app)/layout.tsx` dentro do `<SidebarInset>` (ao lado do `<BillingGate/>`): `<OnboardingGate />`.
Run: `pnpm --filter @nutri-plus/web test onboarding-gate` → PASS.

- [ ] **Step 3: AssinaturaPage reworked (teste primeiro)**

```tsx
// apps/web/src/app/(checkout)/assinatura/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
const startTrial = vi.fn(); const checkout = vi.fn();
vi.mock('@/lib/api/subscription', () => ({ startTrial: () => startTrial(), checkoutSubscription: (b: any) => checkout(b), getSubscription: vi.fn() }));
const useQuery = vi.fn();
vi.mock('@tanstack/react-query', () => ({ useQuery: () => useQuery() }));
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: replace }) }));
import AssinaturaPage from './page';

beforeEach(() => { startTrial.mockReset().mockResolvedValue({ ok: true }); checkout.mockReset(); useQuery.mockReturnValue({ data: { onboardedAt: null, status: 'TRIALING', entitlements: { isReadOnly: true } } }); });

it('no onboarding mostra "Começar teste grátis" e inicia o trial', async () => {
  render(<AssinaturaPage />);
  fireEvent.click(screen.getByRole('button', { name: /começar teste grátis/i }));
  await waitFor(() => expect(startTrial).toHaveBeenCalled());
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
});

it('escolher plano + Pix mostra o QR', async () => {
  checkout.mockResolvedValue({ method: 'PIX', pixQrCode: { encodedImage: 'B64', payload: 'p' } });
  render(<AssinaturaPage />);
  fireEvent.click(screen.getAllByRole('button', { name: /assinar/i })[0]);
  fireEvent.click(screen.getByRole('button', { name: /pix/i }));
  await waitFor(() => expect(screen.getByAltText(/qr code pix/i)).toBeInTheDocument());
});
```
Run: `pnpm --filter @nutri-plus/web test app/\(checkout\)/assinatura` → FAIL.

Implementar `app/(checkout)/assinatura/page.tsx` (default export `AssinaturaPage`, `'use client'`): usa `useQuery({ queryKey: SUBSCRIPTION_KEY, queryFn: getSubscription, refetchInterval: 5000 })`. Estados: `choice{plan,period}`, `method`, `pix` (guardar `pixQrCode`), `loading`, `error`. Fluxo:
- Se `status==='ACTIVE' && !isReadOnly` → sucesso + redireciona `/`.
- Senão, se **sem** `choice`: render `PlanPicker` + (se `data.onboardedAt === null`) um CTA **"Começar teste grátis (7 dias)"** que chama `startTrial()` → `router.replace('/')`.
- Com `choice`: abas **Pix**/**Cartão** (o CPF é coletado **dentro** de cada método, não num passo separado).
  - **Pix** → um campo **CPF/CNPJ** + botão "Gerar código Pix" → `checkoutSubscription({...choice, cpfCnpj, method:'PIX'})` → guarda `pixQrCode` → render `<PixPayment/>`; o poll do `useQuery` detecta ACTIVE → `router.replace('/')`.
  - **Cartão** → `<CardForm/>` (já coleta o CPF) → no submit `checkoutSubscription({...choice, cpfCnpj, method:'CREDIT_CARD', card, holderInfo})` → sucesso `router.replace('/')`; erro (422 CARD_DECLINED) → seta `error` no form.

*(No teste do Pix acima, antes de esperar o QR, preencher o campo CPF e clicar "Gerar código Pix" — ajuste o teste ao render real.)*
Run: `pnpm --filter @nutri-plus/web test app/\(checkout\)/assinatura` → PASS.

- [ ] **Step 4: Deletar a página antiga + tsc + full web**

Deletar `apps/web/src/app/(app)/assinatura/page.tsx` (a rota agora vive em `(checkout)`).
Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit && pnpm --filter @nutri-plus/web test`
Expected: limpo + suíte verde (o `BillingGate`/`SubscriptionTab` que linkam pra `/assinatura` continuam válidos — mesma URL).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(checkout\) apps/web/src/components/billing/onboarding-gate.tsx apps/web/src/components/billing/onboarding-gate.test.tsx apps/web/src/app/\(app\)/layout.tsx
git rm apps/web/src/app/\(app\)/assinatura/page.tsx
git commit -m "feat(web): checkout em route group sem sidebar + onboarding gate + trial-on-click

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Web — gerenciar método de pagamento em Configurações

**Files:**
- Modify: `apps/web/src/components/settings/subscription-tab.tsx`
- Test: `apps/web/src/components/settings/subscription-tab.test.tsx` (estender)

**Interfaces:**
- Consumes: `useSubscription`, `updatePaymentMethod`, `CardForm` (Task 8).

- [ ] **Step 1: Estender o teste (falha primeiro)**

```tsx
it('mostra o método atual e muda para Pix', async () => {
  cancel.mockResolvedValue?.({ ok: true });
  const updatePM = vi.fn().mockResolvedValue({ ok: true });
  // (adicionar ao vi.mock de '@/lib/api/subscription': updatePaymentMethod: (b:any)=>updatePM(b))
  vi.stubGlobal('confirm', () => true);
  useSubscription.mockReturnValue({ data: { status: 'ACTIVE', plan: 'PRO', billingPeriod: 'MONTHLY', currentPeriodEnd: '2026-09-01T00:00:00Z', cancelAtPeriodEnd: false, recentPayments: [], entitlements: { isReadOnly: false }, paymentMethod: 'CREDIT_CARD', cardLast4: '1234', cardBrand: 'VISA' }, refetch: vi.fn() });
  render(<SubscriptionTab />);
  expect(screen.getByText(/1234/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /mudar para pix/i }));
  await waitFor(() => expect(updatePM).toHaveBeenCalledWith(expect.objectContaining({ method: 'PIX' })));
});
```
*(Atualizar o `vi.mock('@/lib/api/subscription', …)` do arquivo pra incluir `updatePaymentMethod`.)*

Run: `pnpm --filter @nutri-plus/web test subscription-tab` → FAIL.

- [ ] **Step 2: Implementar o bloco de método**

Na `SubscriptionTab`, adicionar uma seção "Método de pagamento":
- Exibe: `paymentMethod === 'CREDIT_CARD' ? 'Cartão •••• ' + cardLast4 + ' (' + cardBrand + ')' : paymentMethod === 'PIX' ? 'Pix' : '—'`.
- Ações:
  - Pix → botão "Trocar para cartão" → abre `<CardForm onSubmit={(card, holderInfo, cpf) => updatePaymentMethod({ method:'CREDIT_CARD', cpfCnpj: cpf, card, holderInfo }).then(refetch)} .../>`.
  - Cartão → "Atualizar cartão" (mesmo CardForm) + "Mudar para Pix" (`updatePaymentMethod({ method: 'PIX' })` — sem CPF; o `PaymentMethodDto.cpfCnpj` já é opcional/condicional ao cartão, definido na Task 5).
- Botão que abre o `CardForm` controla um estado local `editing` (loading/error do próprio form).

Run: `pnpm --filter @nutri-plus/web test subscription-tab` → PASS.

- [ ] **Step 3: tsc + commit**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`

```bash
git add apps/web/src/components/settings/subscription-tab.tsx apps/web/src/components/settings/subscription-tab.test.tsx
git commit -m "feat(web): gerenciar método de pagamento (trocar/atualizar cartão, mudar p/ Pix)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Auth — auto-login pós-confirmação (verify-email + doc do template)

**Files:**
- Modify: `apps/web/src/app/(auth)/verify-email/page.tsx`
- Create: `docs/supabase-email-confirmation.md`

**Interfaces:** nenhuma nova (o `/auth/callback` já estabelece a sessão).

- [ ] **Step 1: Ajustar a página verify-email**

O `/auth/callback` já faz `exchangeCodeForSession` → o link do e-mail auto-loga e cai em `/` (o gate leva ao onboarding). O ajuste é de cópia: deixar claro que o **link do e-mail** é o que ativa/entra, e o "Entrar" é só fallback pra quem já confirmou noutro dispositivo. Trocar o texto final:

```tsx
      <p className="text-sm text-muted-foreground">
        Clicar no link do e-mail já ativa sua conta e entra automaticamente.
      </p>
      <p className="text-sm text-muted-foreground">
        Abriu em outro dispositivo?{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">Entrar</Link>
      </p>
```

- [ ] **Step 2: Documentar a config do Supabase (deploy)**

Criar `docs/supabase-email-confirmation.md` explicando: no painel Supabase → Authentication → URL Configuration, `Site URL` = origem do web (prod/dev) e incluir `…/auth/callback` nas Redirect URLs; o template "Confirm signup" usa `{{ .ConfirmationURL }}` (que redireciona pro `redirect_to` = `/auth/callback?code=…`), garantindo que o clique no e-mail passe pelo callback (que já loga). Sem isso, o link cai no `/login` e o usuário redigita a senha.

- [ ] **Step 3: Verificar web (nada quebrou) + commit**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit && pnpm --filter @nutri-plus/web test verify-email`
*(Se não houver teste de verify-email, rode a suíte inteira do web pra confirmar que a mudança de cópia não ripou nada.)*

```bash
git add apps/web/src/app/\(auth\)/verify-email/page.tsx docs/supabase-email-confirmation.md
git commit -m "docs+web: auto-login pós-confirmação (cópia verify-email + config Supabase)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificação final (após todas as tarefas)

- [ ] shared-types: `pnpm --filter @nutri-plus/shared-types build` — limpo.
- [ ] API: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit` — verde.
- [ ] Web: `pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit` — verde.
- [ ] Mobile (não deve ripar): `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` — limpo.
- [ ] Deploy: configurar o template/URLs de confirmação do Supabase (Task 11); o webhook e as envs do Asaas já estão do PR original.

## Notas de escopo / decisões travadas

- **Checkout transparente**: Pix (QR + poll) e cartão (confirma síncrono → ACTIVE). `invoiceUrl` removido.
- **Trial começa no clique** (`start-trial`); signup cria `trialEndsAt = null`.
- **Gate de onboarding** só p/ NUTRITIONIST, uma vez (`onboardedAt`).
- **PCI**: cartão nunca armazenado/logado (só last4/brand/token).
- **I2 parqueado** segue como follow-up (troca de plano paga via Pix); não faz parte deste plano.
- **Mobile/paciente intocados.**
