# Assinatura Paga + Trial 7d (Asaas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar o nutri_plus no modelo de assinatura paga (Essencial/Pro) com trial de 7 dias sem cartão, gating por entitlements + cota de IA, expiração somente-leitura, e cobrança recorrente via Asaas.

**Architecture:** O `NutritionistProfile` ganha uma `Subscription` 1:1. Um `EntitlementsService` (fonte única) resolve o acesso derivado (`isComp`/`ACTIVE`/`TRIALING`/read-only) e as cotas por contagem de `AIInteraction`. Um `SubscriptionGuard` global (3º `APP_GUARD`) bloqueia escrita em read-only e recursos Pro (`@RequiresFeature`); as cotas de IA são checadas inline nos serviços do nutricionista. O Asaas cuida da recorrência via `fetch` puro: checkout hospedado (`invoiceUrl`) + webhook idempotente que vira o estado. A web expõe `useSubscription()`, banners, locks e a página de paywall. Mobile/paciente ficam intocados e grátis.

**Tech Stack:** NestJS 10 + Prisma 7 (pg adapter) · Next.js 16 (App Router, react-query, shadcn/ui) · shared-types · Asaas REST v3 (via fetch) · jest (API) / vitest (web).

## Global Constraints

- Migração **aditiva** apenas: `Subscription`, `SubscriptionPayment`, enums `PlanTier`/`BillingPeriod`/`SubscriptionStatus`, `AIInteraction.nutritionistId` + índice, back-relations. Convenção do schema: camelCase, sem `@map`/`@db`, `@default(uuid())`, tabelas PascalCase. `pnpm --filter @nutri-plus/api exec prisma migrate dev` + `prisma generate`.
- **shared-types reconstruído** após mudar `packages/shared-types` (`pnpm --filter @nutri-plus/shared-types build`).
- **Sem dependência nova no servidor** (Asaas via `fetch`). Web reusa react-query / react-hook-form + zod / shadcn — **sem dep nova**. Todo texto de UI em **pt-BR**.
- Cliente pagante = `NutritionistProfile`; **paciente e app mobile grátis e INALTERADOS** (nenhum arquivo em `apps/mobile`).
- Self-serve = `@Roles(UserRole.NUTRITIONIST)` + `resolveScopeNutritionistId(ctx)`; webhook = `@Public()` + segredo `asaas-access-token` **fail-closed 401** (padrão do endpoint interno de lembretes).
- **Contrato de erro 402**: corpo `{ statusCode: 402, code, feature? }`, `code ∈ {READ_ONLY, AI_QUOTA_EXCEEDED, FEATURE_PRO_ONLY, SEAT_LIMIT}`.
- **Catálogo de planos é a fonte única** (`PLAN_CATALOG` em shared-types): Essencial R$49/mês, R$490/ano, 30 ações IA/mês, 0 silhueta, 0 transcrição, 0 assentos, features `[]`. Pro R$99/mês, R$990/ano, 200 ações IA/mês, 40 silhueta, 30 transcrição, 2 assentos, features `['silhueta','transcription','employees']`.
- **Cota "ações de IA"** = contagem de `MEAL_PLAN_GENERATION` + `MEAL_PLAN_ADJUSTMENT` (nutricionista, `smart`-tier) no mês corrente. **`OUTSIDE_HOME_SUGGESTION` NÃO conta** (paciente, app grátis) — só carimba `nutritionistId`. Silhueta/transcrição = feature-gated (Pro) + cap próprio por contagem.
- **Janela de cota** = mês-calendário em `America/Sao_Paulo` (UTC-3, sem DST).
- **Trial** = 7 dias (novos cadastros, acesso nível-Pro). **Cortesia** = 30 dias (contas existentes na migração). **`isComp`** = Pro permanente (allowlist por e-mail).
- Trial/cortesia/`ACTIVE` = acesso conforme regra derivada; senão **somente-leitura** (lê via GET, bloqueia escrita).
- Env novas (`env.schema`): `ASAAS_API_KEY`, `ASAAS_API_URL`, `ASAAS_WEBHOOK_TOKEN` — **`.optional()`** (como `REMINDER_DISPATCH_KEY`); `AsaasService` faz `getOrThrow` no uso.
- Aspas: **api single quotes**; web por arquivo (seguir o arquivo vizinho). Testes **API jest / web vitest**. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch `feat/assinatura-pagamentos`. **Não** fazer push/PR. Verificar por área: shared-types build; API `pnpm --filter @nutri-plus/api test` + `tsc`; web `pnpm --filter @nutri-plus/web test` + `tsc`; mobile `tsc` não deve ripar.

---

## File Structure

**shared-types**
- Create `packages/shared-types/src/v1/billing.ts` — unions (`PlanTier`, `BillingPeriod`, `SubscriptionStatus`, `BillingErrorCode`, `PlanFeature`), `PlanConfig`, `PLAN_CATALOG`, `Entitlements`, `SubscriptionView`, `SubscriptionPaymentView`, `CheckoutRequest`, `CheckoutResponse`.
- Modify `packages/shared-types/src/v1/index.ts` — `export * from './billing'`.

**API — Prisma**
- Modify `apps/api/prisma/schema.prisma` — 3 enums, `Subscription`, `SubscriptionPayment`, `AIInteraction.nutritionistId` + index, `NutritionistProfile.subscription`/`aiInteractions` back-relations. New migration dir under `apps/api/prisma/migrations/`.

**API — módulo billing** (`apps/api/src/billing/`)
- `plan-policy.ts` — `TRIAL_DAYS`, `COURTESY_DAYS`, `saoPauloMonthStart`, `entitlementsForTier`, re-export `PLAN_CATALOG`.
- `payment-required.exception.ts` — `PaymentRequiredException` (402 + code/feature).
- `entitlements.service.ts` — acesso derivado + asserts de cota/cap/assento.
- `decorators.ts` — `@RequiresFeature`, `@BillingExempt` + metadata keys.
- `subscription.guard.ts` — guard global (read-only + feature).
- `asaas.service.ts` — cliente fetch (customer/subscription/cancel).
- `subscription.service.ts` — `getView`, `checkout`, `cancel`, `handleWebhook`.
- `me-subscription.controller.ts` — `me/subscription` (GET/checkout/cancel), `@Roles(NUTRITIONIST)`.
- `internal-asaas.controller.ts` — `internal/asaas/webhook`, `@Public`.
- `dto/checkout.dto.ts` — class-validator.
- `billing.module.ts` — exporta `EntitlementsService` (+ guard providers).
- specs: `entitlements.service.spec.ts`, `subscription.guard.spec.ts`, `asaas.service.spec.ts`, `subscription.service.spec.ts`, `subscription-webhook.spec.ts`.

**API — pontos de integração (modificados)**
- `apps/api/src/app.module.ts` — importa `BillingModule`; 3º `APP_GUARD` = `SubscriptionGuard`.
- `apps/api/src/config/env.schema.ts` — 3 vars Asaas.
- `apps/api/src/ai/types/ai.types.ts`, `ai/openai.provider.ts`, `ai/ai-interactions.service.ts` — thread `nutritionistId`.
- `apps/api/src/meal-generation/meal-generation.service.ts` — `assertAiActionQuota` + stamp.
- `apps/api/src/outside-home/outside-home.service.ts` — stamp (sem assert).
- `apps/api/src/silhueta/silhueta.controller.ts` + `silhueta.service.ts` — `@RequiresFeature('silhueta')` + `assertUsageCap` + stamp.
- `apps/api/src/patients/audios/audios.controller.ts` + `audios.service.ts` — `@RequiresFeature('transcription')` + `assertUsageCap` + stamp.
- `apps/api/src/employees/employees.controller.ts` + `employees.service.ts` — `@RequiresFeature('employees')` + `assertSeatAvailable`.
- `apps/api/src/users/users.service.ts` — seed trial 7d em `createNutritionist`.
- `apps/api/scripts/seed-subscriptions.ts` — cortesia 30d + comp allowlist (one-off).

**Web** (`apps/web/src/`)
- `lib/api/subscription.ts` — `getSubscription`, `checkoutSubscription`, `cancelSubscription`.
- `lib/queries/subscription.ts` — `useSubscription`, `SUBSCRIPTION_KEY`.
- `lib/api/billing-errors.ts` — `billingErrorFrom(err)`.
- `lib/billing/billing-events.ts` — pub/sub in-memory.
- `app/providers.tsx` — QueryClient com `QueryCache`/`MutationCache` `onError` → `emitBilling`.
- `components/billing/billing-gate.tsx` — banners + read-only + modais 402 (montado no layout).
- `components/billing/ai-quota-chip.tsx`, `components/billing/pro-lock.tsx`.
- `app/(app)/layout.tsx` — monta `<BillingGate/>`.
- `app/(app)/assinatura/page.tsx` + `components/billing/plan-picker.tsx`, `checkout-form.tsx`, `checkout-return.tsx`.
- `components/settings/subscription-tab.tsx` + `settings-view.tsx` (nova aba).
- Locks: `components/patients/patient-detail.tsx` (silhueta/transcrição) + `app/(app)/employees/*` (add).
- specs: `*.test.ts(x)` correspondentes.

---

## Task 1: shared-types — tipos de billing + PLAN_CATALOG

**Files:**
- Create: `packages/shared-types/src/v1/billing.ts`
- Modify: `packages/shared-types/src/v1/index.ts`
- Test: `packages/shared-types/src/v1/billing.spec.ts` (se o pacote tiver runner; senão o build é a verificação)

**Interfaces:**
- Produces: `PlanTier`, `BillingPeriod`, `SubscriptionStatus`, `BillingErrorCode`, `PlanFeature`, `PlanConfig`, `PLAN_CATALOG`, `Entitlements`, `SubscriptionPaymentView`, `SubscriptionView`, `CheckoutRequest`, `CheckoutResponse`.

- [ ] **Step 1: Escrever `billing.ts`**

```ts
// packages/shared-types/src/v1/billing.ts
// Valores das unions batem EXATAMENTE com os membros dos enums Prisma (Task 2).
export type PlanTier = 'ESSENCIAL' | 'PRO';
export type BillingPeriod = 'MONTHLY' | 'YEARLY';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
export type BillingErrorCode =
  | 'READ_ONLY'
  | 'AI_QUOTA_EXCEEDED'
  | 'FEATURE_PRO_ONLY'
  | 'SEAT_LIMIT';
export type PlanFeature = 'silhueta' | 'transcription' | 'employees';

export interface PlanConfig {
  tier: PlanTier;
  monthlyBrl: number;
  yearlyBrl: number;
  aiActionsPerMonth: number; // MEAL_PLAN_GENERATION + MEAL_PLAN_ADJUSTMENT
  silhuetaPerMonth: number;
  transcriptionPerMonth: number;
  employeeSeats: number;
  features: PlanFeature[];
}

// Fonte ÚNICA dos planos (server enforcement + web display). Não é segredo.
export const PLAN_CATALOG: Record<PlanTier, PlanConfig> = {
  ESSENCIAL: {
    tier: 'ESSENCIAL',
    monthlyBrl: 49,
    yearlyBrl: 490,
    aiActionsPerMonth: 30,
    silhuetaPerMonth: 0,
    transcriptionPerMonth: 0,
    employeeSeats: 0,
    features: [],
  },
  PRO: {
    tier: 'PRO',
    monthlyBrl: 99,
    yearlyBrl: 990,
    aiActionsPerMonth: 200,
    silhuetaPerMonth: 40,
    transcriptionPerMonth: 30,
    employeeSeats: 2,
    features: ['silhueta', 'transcription', 'employees'],
  },
};

export interface Entitlements {
  tier: PlanTier;
  isReadOnly: boolean;
  features: Record<PlanFeature, boolean>;
  aiQuota: number; // ações de IA/mês do tier vigente
  aiUsed: number; // gen + adjust no mês corrente
}

export interface SubscriptionPaymentView {
  id: string;
  amount: number;
  status: string;
  billingType: string | null;
  dueDate: string | null; // ISO
  paidAt: string | null; // ISO
}

export interface SubscriptionView {
  status: SubscriptionStatus;
  isComp: boolean;
  trialEndsAt: string | null; // ISO
  plan: PlanTier | null;
  billingPeriod: BillingPeriod | null;
  currentPeriodEnd: string | null; // ISO
  cancelAtPeriodEnd: boolean;
  entitlements: Entitlements;
  recentPayments: SubscriptionPaymentView[];
}

export interface CheckoutRequest {
  plan: PlanTier;
  period: BillingPeriod;
  cpfCnpj: string;
}

export interface CheckoutResponse {
  invoiceUrl: string;
}
```

- [ ] **Step 2: Exportar no index**

Em `packages/shared-types/src/v1/index.ts` adicionar a linha (mantendo a ordem alfabética se o arquivo usar):

```ts
export * from './billing';
```

- [ ] **Step 3: Build do shared-types (verificação)**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: build limpo; `dist/v1/billing.js` + `.d.ts` gerados; `PLAN_CATALOG` exportado.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/v1/billing.ts packages/shared-types/src/v1/index.ts
git commit -m "feat(shared-types): planos, entitlements e views de assinatura

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Prisma — Subscription, SubscriptionPayment, AIInteraction.nutritionistId

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_assinatura_pagamentos/migration.sql` (gerado)

**Interfaces:**
- Produces: models Prisma `Subscription`, `SubscriptionPayment`; enums `PlanTier`/`BillingPeriod`/`SubscriptionStatus`; campo `AIInteraction.nutritionistId`.

Migração de schema — sem teste unitário; a verificação é `migrate dev` + `generate` + build.

- [ ] **Step 1: Adicionar enums (junto aos outros `enum` do schema)**

```prisma
enum PlanTier {
  ESSENCIAL
  PRO
}

enum BillingPeriod {
  MONTHLY
  YEARLY
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
}
```

- [ ] **Step 2: Adicionar os models**

```prisma
model Subscription {
  id             String   @id @default(uuid())
  nutritionistId String   @unique
  nutritionist   NutritionistProfile @relation(fields: [nutritionistId], references: [id], onDelete: Cascade)

  status         SubscriptionStatus @default(TRIALING)
  isComp         Boolean  @default(false)
  trialEndsAt    DateTime?

  plan           PlanTier?
  billingPeriod  BillingPeriod?
  currentPeriodEnd  DateTime?
  cancelAtPeriodEnd Boolean @default(false)

  asaasCustomerId     String?
  asaasSubscriptionId String?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  payments       SubscriptionPayment[]

  @@index([status])
}

model SubscriptionPayment {
  id             String   @id @default(uuid())
  subscriptionId String
  subscription   Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  asaasPaymentId String   @unique
  amount         Float
  status         String
  billingType    String?
  dueDate        DateTime?
  paidAt         DateTime?
  createdAt      DateTime @default(now())

  @@index([subscriptionId, createdAt])
}
```

- [ ] **Step 3: Back-relations + AIInteraction.nutritionistId**

No `model NutritionistProfile`, adicionar:

```prisma
  subscription  Subscription?
  aiInteractions AIInteraction[]
```

No `model AIInteraction`, adicionar o campo + relação + índice (junto dos índices existentes):

```prisma
  nutritionistId String?
  nutritionist   NutritionistProfile? @relation(fields: [nutritionistId], references: [id], onDelete: SetNull)
```
```prisma
  @@index([nutritionistId, createdAt])
```

- [ ] **Step 4: Gerar a migração**

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name assinatura_pagamentos`
Expected: cria a pasta de migração; aplica no dev DB; nenhuma coluna existente alterada (só adições).

- [ ] **Step 5: Gerar o client + tsc**

Run: `pnpm --filter @nutri-plus/api exec prisma generate && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: client tem `prisma.subscription`, `prisma.subscriptionPayment`, `AIInteraction.nutritionistId`; tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): schema de Subscription + SubscriptionPayment + AIInteraction.nutritionistId

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: billing — plan-policy + EntitlementsService

**Files:**
- Create: `apps/api/src/billing/plan-policy.ts`
- Create: `apps/api/src/billing/payment-required.exception.ts`
- Create: `apps/api/src/billing/entitlements.service.ts`
- Test: `apps/api/src/billing/entitlements.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`; `PLAN_CATALOG`, `Entitlements`, `PlanFeature`, `PlanTier`, `BillingErrorCode` (shared-types); `AIInteractionType` (prisma client).
- Produces:
  - `TRIAL_DAYS = 7`, `COURTESY_DAYS = 30`, `saoPauloMonthStart(now: Date): Date`, `entitlementsForTier(tier, aiUsed): Omit<Entitlements,'isReadOnly'>` (plan-policy).
  - `class PaymentRequiredException` (payment-required.exception).
  - `EntitlementsService`:
    - `getEntitlements(nutritionistId: string): Promise<Entitlements>`
    - `assertAiActionQuota(nutritionistId: string): Promise<void>` (throws `AI_QUOTA_EXCEEDED`)
    - `assertUsageCap(nutritionistId: string, feature: 'silhueta' | 'transcription'): Promise<void>` (throws `AI_QUOTA_EXCEEDED`, `feature`)
    - `assertSeatAvailable(nutritionistId: string): Promise<void>` (throws `SEAT_LIMIT`)

- [ ] **Step 1: Escrever a exceção 402**

```ts
// apps/api/src/billing/payment-required.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';
import type { BillingErrorCode, PlanFeature } from '@nutri-plus/shared-types';

export class PaymentRequiredException extends HttpException {
  constructor(code: BillingErrorCode, feature?: PlanFeature) {
    super({ statusCode: 402, code, feature }, HttpStatus.PAYMENT_REQUIRED);
  }
}
```

- [ ] **Step 2: Escrever plan-policy**

```ts
// apps/api/src/billing/plan-policy.ts
import { PLAN_CATALOG, type Entitlements, type PlanFeature, type PlanTier } from '@nutri-plus/shared-types';

export const TRIAL_DAYS = 7;
export const COURTESY_DAYS = 30;

// Início do mês em America/Sao_Paulo (UTC-3, sem DST) expresso em instante UTC.
export function saoPauloMonthStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value); // 1-12
  // 00:00 em São Paulo == 03:00 UTC.
  return new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
}

export function entitlementsForTier(tier: PlanTier, aiUsed: number): Omit<Entitlements, 'isReadOnly'> {
  const cfg = PLAN_CATALOG[tier];
  const has = (f: PlanFeature) => cfg.features.includes(f);
  return {
    tier,
    features: { silhueta: has('silhueta'), transcription: has('transcription'), employees: has('employees') },
    aiQuota: cfg.aiActionsPerMonth,
    aiUsed,
  };
}
```

- [ ] **Step 3: Escrever o teste do EntitlementsService (falha primeiro)**

```ts
// apps/api/src/billing/entitlements.service.spec.ts
import { EntitlementsService } from './entitlements.service';
import { PaymentRequiredException } from './payment-required.exception';

const HOUR = 3600_000;
function futureDate(days: number) { return new Date(Date.now() + days * 24 * HOUR); }
function pastDate(days: number) { return new Date(Date.now() - days * 24 * HOUR); }

// Prisma mockado: subscription.findUnique, aIInteraction.count, employeeProfile.count
function makePrisma(overrides: Partial<{ sub: any; aiCount: number; empCount: number }> = {}) {
  return {
    subscription: { findUnique: jest.fn().mockResolvedValue(overrides.sub ?? null) },
    aIInteraction: { count: jest.fn().mockResolvedValue(overrides.aiCount ?? 0) },
    employeeProfile: { count: jest.fn().mockResolvedValue(overrides.empCount ?? 0) },
  } as any;
}

describe('EntitlementsService.getEntitlements', () => {
  it('isComp → Pro, não read-only', async () => {
    const svc = new EntitlementsService(makePrisma({ sub: { isComp: true, status: 'CANCELED', plan: null } }));
    const e = await svc.getEntitlements('n1');
    expect(e).toMatchObject({ tier: 'PRO', isReadOnly: false, aiQuota: 200 });
    expect(e.features.silhueta).toBe(true);
  });

  it('ACTIVE dentro do período → tier do plano, não read-only', async () => {
    const svc = new EntitlementsService(makePrisma({ sub: { isComp: false, status: 'ACTIVE', plan: 'ESSENCIAL', currentPeriodEnd: futureDate(10) } }));
    const e = await svc.getEntitlements('n1');
    expect(e).toMatchObject({ tier: 'ESSENCIAL', isReadOnly: false, aiQuota: 30 });
    expect(e.features.silhueta).toBe(false);
  });

  it('TRIALING antes do fim → Pro, não read-only', async () => {
    const svc = new EntitlementsService(makePrisma({ sub: { isComp: false, status: 'TRIALING', plan: null, trialEndsAt: futureDate(3) } }));
    const e = await svc.getEntitlements('n1');
    expect(e).toMatchObject({ tier: 'PRO', isReadOnly: false });
  });

  it('TRIALING vencido → read-only', async () => {
    const svc = new EntitlementsService(makePrisma({ sub: { isComp: false, status: 'TRIALING', plan: null, trialEndsAt: pastDate(1) } }));
    expect((await svc.getEntitlements('n1')).isReadOnly).toBe(true);
  });

  it('PAST_DUE → read-only', async () => {
    const svc = new EntitlementsService(makePrisma({ sub: { isComp: false, status: 'PAST_DUE', plan: 'PRO' } }));
    expect((await svc.getEntitlements('n1')).isReadOnly).toBe(true);
  });

  it('sem assinatura → read-only (defensivo)', async () => {
    const svc = new EntitlementsService(makePrisma({ sub: null }));
    expect((await svc.getEntitlements('n1')).isReadOnly).toBe(true);
  });

  it('aiUsed reflete a contagem de gen+adjust', async () => {
    const prisma = makePrisma({ sub: { isComp: true }, aiCount: 12 });
    const e = await new EntitlementsService(prisma).getEntitlements('n1');
    expect(e.aiUsed).toBe(12);
    expect(prisma.aIInteraction.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        nutritionistId: 'n1',
        success: true,
        type: { in: ['MEAL_PLAN_GENERATION', 'MEAL_PLAN_ADJUSTMENT'] },
      }),
    }));
  });
});

describe('EntitlementsService asserts', () => {
  it('assertAiActionQuota estoura AI_QUOTA_EXCEEDED no limite', async () => {
    const svc = new EntitlementsService(makePrisma({ sub: { isComp: false, status: 'ACTIVE', plan: 'ESSENCIAL', currentPeriodEnd: futureDate(5) }, aiCount: 30 }));
    await expect(svc.assertAiActionQuota('n1')).rejects.toBeInstanceOf(PaymentRequiredException);
  });

  it('assertAiActionQuota passa abaixo do limite', async () => {
    const svc = new EntitlementsService(makePrisma({ sub: { isComp: false, status: 'ACTIVE', plan: 'ESSENCIAL', currentPeriodEnd: futureDate(5) }, aiCount: 29 }));
    await expect(svc.assertAiActionQuota('n1')).resolves.toBeUndefined();
  });

  it('assertUsageCap(silhueta) estoura no cap do Pro (40)', async () => {
    const svc = new EntitlementsService(makePrisma({ sub: { isComp: true }, aiCount: 40 }));
    await expect(svc.assertUsageCap('n1', 'silhueta')).rejects.toBeInstanceOf(PaymentRequiredException);
  });

  it('assertSeatAvailable estoura SEAT_LIMIT quando cheio', async () => {
    const svc = new EntitlementsService(makePrisma({ sub: { isComp: true }, empCount: 2 }));
    await expect(svc.assertSeatAvailable('n1')).rejects.toBeInstanceOf(PaymentRequiredException);
  });
});
```

Run: `pnpm --filter @nutri-plus/api test entitlements.service`
Expected: FAIL (módulo não existe).

- [ ] **Step 4: Implementar o EntitlementsService**

```ts
// apps/api/src/billing/entitlements.service.ts
import { Injectable } from '@nestjs/common';
import type { Entitlements, PlanTier } from '@nutri-plus/shared-types';
import { PLAN_CATALOG } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AIInteractionType } from '../generated/prisma/client';
import { entitlementsForTier, saoPauloMonthStart } from './plan-policy';
import { PaymentRequiredException } from './payment-required.exception';

const AI_ACTION_TYPES = [
  AIInteractionType.MEAL_PLAN_GENERATION,
  AIInteractionType.MEAL_PLAN_ADJUSTMENT,
];

interface DerivedAccess {
  tier: PlanTier;
  isReadOnly: boolean;
}

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEntitlements(nutritionistId: string): Promise<Entitlements> {
    const access = await this.resolveAccess(nutritionistId);
    const aiUsed = await this.countUsage(nutritionistId, AI_ACTION_TYPES);
    return { ...entitlementsForTier(access.tier, aiUsed), isReadOnly: access.isReadOnly };
  }

  async assertAiActionQuota(nutritionistId: string): Promise<void> {
    const { tier } = await this.resolveAccess(nutritionistId);
    const used = await this.countUsage(nutritionistId, AI_ACTION_TYPES);
    if (used >= PLAN_CATALOG[tier].aiActionsPerMonth) {
      throw new PaymentRequiredException('AI_QUOTA_EXCEEDED');
    }
  }

  async assertUsageCap(nutritionistId: string, feature: 'silhueta' | 'transcription'): Promise<void> {
    const { tier } = await this.resolveAccess(nutritionistId);
    const cfg = PLAN_CATALOG[tier];
    const type = feature === 'silhueta'
      ? AIInteractionType.SILHUETA_SCAN
      : AIInteractionType.CONSULTATION_TRANSCRIPTION;
    const cap = feature === 'silhueta' ? cfg.silhuetaPerMonth : cfg.transcriptionPerMonth;
    const used = await this.countUsage(nutritionistId, [type]);
    if (used >= cap) {
      throw new PaymentRequiredException('AI_QUOTA_EXCEEDED', feature);
    }
  }

  async assertSeatAvailable(nutritionistId: string): Promise<void> {
    const { tier } = await this.resolveAccess(nutritionistId);
    const count = await this.prisma.employeeProfile.count({ where: { nutritionistId } });
    if (count >= PLAN_CATALOG[tier].employeeSeats) {
      throw new PaymentRequiredException('SEAT_LIMIT');
    }
  }

  private async resolveAccess(nutritionistId: string): Promise<DerivedAccess> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    const now = new Date();
    if (!sub) return { tier: 'ESSENCIAL', isReadOnly: true };
    if (sub.isComp) return { tier: 'PRO', isReadOnly: false };
    if (sub.status === 'ACTIVE' && sub.currentPeriodEnd && sub.currentPeriodEnd > now) {
      return { tier: sub.plan ?? 'ESSENCIAL', isReadOnly: false };
    }
    if (sub.status === 'TRIALING' && sub.trialEndsAt && sub.trialEndsAt > now) {
      return { tier: 'PRO', isReadOnly: false };
    }
    return { tier: sub.plan ?? 'ESSENCIAL', isReadOnly: true };
  }

  private countUsage(nutritionistId: string, types: AIInteractionType[]): Promise<number> {
    return this.prisma.aIInteraction.count({
      where: {
        nutritionistId,
        success: true,
        type: { in: types },
        createdAt: { gte: saoPauloMonthStart(new Date()) },
      },
    });
  }
}
```

- [ ] **Step 5: Rodar os testes (passam)**

Run: `pnpm --filter @nutri-plus/api test entitlements.service`
Expected: PASS (todos os casos).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/billing/plan-policy.ts apps/api/src/billing/payment-required.exception.ts apps/api/src/billing/entitlements.service.ts apps/api/src/billing/entitlements.service.spec.ts
git commit -m "feat(api): EntitlementsService (acesso derivado + cotas por contagem)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: billing — decorators, SubscriptionGuard, módulo e wiring global

**Files:**
- Create: `apps/api/src/billing/decorators.ts`
- Create: `apps/api/src/billing/subscription.guard.ts`
- Create: `apps/api/src/billing/billing.module.ts`
- Test: `apps/api/src/billing/subscription.guard.spec.ts`
- Modify: `apps/api/src/app.module.ts` (import `BillingModule` + 3º `APP_GUARD`)
- Modify: `apps/api/src/silhueta/silhueta.controller.ts` (`@RequiresFeature('silhueta')` no `@Post()` create)
- Modify: `apps/api/src/patients/audios/audios.controller.ts` (`@RequiresFeature('transcription')` no `transcribe`)
- Modify: `apps/api/src/employees/employees.controller.ts` (`@RequiresFeature('employees')` no `@Post()`)

**Interfaces:**
- Consumes: `EntitlementsService` (Task 3); `resolveScopeNutritionistId` (`auth/auth-scope`); `IS_PUBLIC_KEY` (`auth/decorators/public.decorator`); `ROLES_KEY`; `AuthContext`; `UserRole`.
- Produces: `RequiresFeature(feature: PlanFeature)`, `BillingExempt()`, `REQUIRES_FEATURE_KEY`, `BILLING_EXEMPT_KEY`; `SubscriptionGuard`; `BillingModule` (exporta `EntitlementsService`).

- [ ] **Step 1: Decorators**

```ts
// apps/api/src/billing/decorators.ts
import { SetMetadata } from '@nestjs/common';
import type { PlanFeature } from '@nutri-plus/shared-types';

export const REQUIRES_FEATURE_KEY = 'requiresFeature';
export const BILLING_EXEMPT_KEY = 'billingExempt';

export const RequiresFeature = (feature: PlanFeature) => SetMetadata(REQUIRES_FEATURE_KEY, feature);
export const BillingExempt = () => SetMetadata(BILLING_EXEMPT_KEY, true);
```

- [ ] **Step 2: Teste do guard (falha primeiro)**

```ts
// apps/api/src/billing/subscription.guard.spec.ts
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../generated/prisma/client';
import { SubscriptionGuard } from './subscription.guard';
import { PaymentRequiredException } from './payment-required.exception';

function ctx(method: string, user: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}
const nutri = { user: { role: UserRole.NUTRITIONIST, nutritionistProfile: { id: 'n1' } } };
const patient = { user: { role: UserRole.PATIENT, patientProfile: { id: 'p1' } } };

function makeGuard(meta: Partial<{ isPublic: boolean; exempt: boolean; feature: string }>, entitlements: any) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === 'isPublic') return meta.isPublic;
      if (key === 'billingExempt') return meta.exempt;
      if (key === 'requiresFeature') return meta.feature;
      return undefined;
    }),
  } as unknown as Reflector;
  const ent = { getEntitlements: jest.fn().mockResolvedValue(entitlements) } as any;
  return new SubscriptionGuard(reflector, ent);
}

describe('SubscriptionGuard', () => {
  it('libera rota @Public', async () => {
    const g = makeGuard({ isPublic: true }, null);
    expect(await g.canActivate(ctx('POST', null))).toBe(true);
  });
  it('libera role PATIENT (escrita)', async () => {
    const g = makeGuard({}, null);
    expect(await g.canActivate(ctx('POST', patient))).toBe(true);
  });
  it('libera GET mesmo em read-only', async () => {
    const g = makeGuard({}, { isReadOnly: true, features: {} });
    expect(await g.canActivate(ctx('GET', nutri))).toBe(true);
  });
  it('libera rota @BillingExempt (escrita)', async () => {
    const g = makeGuard({ exempt: true }, { isReadOnly: true, features: {} });
    expect(await g.canActivate(ctx('POST', nutri))).toBe(true);
  });
  it('bloqueia escrita de nutri em read-only → READ_ONLY', async () => {
    const g = makeGuard({}, { isReadOnly: true, features: {} });
    await expect(g.canActivate(ctx('POST', nutri))).rejects.toBeInstanceOf(PaymentRequiredException);
  });
  it('bloqueia @RequiresFeature sem direito → FEATURE_PRO_ONLY', async () => {
    const g = makeGuard({ feature: 'silhueta' }, { isReadOnly: false, features: { silhueta: false } });
    await expect(g.canActivate(ctx('POST', nutri))).rejects.toBeInstanceOf(PaymentRequiredException);
  });
  it('libera @RequiresFeature com direito', async () => {
    const g = makeGuard({ feature: 'silhueta' }, { isReadOnly: false, features: { silhueta: true } });
    expect(await g.canActivate(ctx('POST', nutri))).toBe(true);
  });
});
```

Run: `pnpm --filter @nutri-plus/api test subscription.guard`
Expected: FAIL (guard não existe).

- [ ] **Step 3: Implementar o guard**

```ts
// apps/api/src/billing/subscription.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlanFeature } from '@nutri-plus/shared-types';
import { UserRole } from '../generated/prisma/client';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { EntitlementsService } from './entitlements.service';
import { PaymentRequiredException } from './payment-required.exception';
import { BILLING_EXEMPT_KEY, REQUIRES_FEATURE_KEY } from './decorators';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(BILLING_EXEMPT_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest();
    const authCtx: AuthContext = req.user;
    const role = authCtx?.user?.role;

    // Pacientes são grátis; billing só governa o tenant do nutricionista.
    if (role !== UserRole.NUTRITIONIST && role !== UserRole.EMPLOYEE) return true;

    const feature = this.reflector.getAllAndOverride<PlanFeature | undefined>(REQUIRES_FEATURE_KEY, targets);
    const isWrite = !READ_METHODS.has(req.method);

    // Leituras sem exigência de feature passam mesmo em read-only.
    if (!isWrite && !feature) return true;

    const nutritionistId = resolveScopeNutritionistId(authCtx);
    const ent = await this.entitlements.getEntitlements(nutritionistId);

    if (feature && !ent.features[feature]) {
      throw new PaymentRequiredException('FEATURE_PRO_ONLY', feature);
    }
    if (isWrite && ent.isReadOnly) {
      throw new PaymentRequiredException('READ_ONLY');
    }
    return true;
  }
}
```

- [ ] **Step 4: Módulo billing (exporta EntitlementsService + guard)**

```ts
// apps/api/src/billing/billing.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionGuard } from './subscription.guard';

@Module({
  imports: [PrismaModule],
  providers: [EntitlementsService, SubscriptionGuard],
  exports: [EntitlementsService, SubscriptionGuard],
})
export class BillingModule {}
```

- [ ] **Step 5: Wire no app.module (import + 3º APP_GUARD)**

Em `apps/api/src/app.module.ts`: importar `BillingModule` e `SubscriptionGuard`, adicionar `BillingModule` ao array `imports`, e registrar o guard **depois** do `RolesGuard`:

```ts
import { BillingModule } from './billing/billing.module';
import { SubscriptionGuard } from './billing/subscription.guard';
// ...imports: [ ...existing, BillingModule ]
// ...providers, após { provide: APP_GUARD, useClass: RolesGuard },:
    { provide: APP_GUARD, useClass: SubscriptionGuard },
```

- [ ] **Step 6: Aplicar `@RequiresFeature` nos 3 controllers Pro-only**

`silhueta.controller.ts` — no método `@Post()` create (import `{ RequiresFeature } from '../billing/decorators'`):
```ts
  @Post()
  @RequiresFeature('silhueta')
```
`patients/audios/audios.controller.ts` — no `@Post(':audioId/transcribe')` (import `{ RequiresFeature } from '../../billing/decorators'`):
```ts
  @Post(':audioId/transcribe')
  @RequiresFeature('transcription')
```
`employees/employees.controller.ts` — no `@Post()` (import `{ RequiresFeature } from '../billing/decorators'`):
```ts
  @Post()
  @RequiresFeature('employees')
```

- [ ] **Step 7: Rodar guard test + tsc**

Run: `pnpm --filter @nutri-plus/api test subscription.guard && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: PASS + tsc limpo.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/billing/decorators.ts apps/api/src/billing/subscription.guard.ts apps/api/src/billing/subscription.guard.spec.ts apps/api/src/billing/billing.module.ts apps/api/src/app.module.ts apps/api/src/silhueta/silhueta.controller.ts apps/api/src/patients/audios/audios.controller.ts apps/api/src/employees/employees.controller.ts
git commit -m "feat(api): SubscriptionGuard global (read-only + @RequiresFeature) + wiring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: AI — carimbar `nutritionistId` no `AIInteraction`

**Files:**
- Modify: `apps/api/src/ai/types/ai.types.ts` (add `nutritionistId?` a `GenerateStructuredOptions`)
- Modify: `apps/api/src/ai/ai-interactions.service.ts` (add `nutritionistId?` a `RecordInteractionInput` + persistir)
- Modify: `apps/api/src/ai/openai.provider.ts` (thread `nutritionistId` nas chamadas `record()` + `transcribeAudio` opts)
- Modify: `apps/api/src/meal-generation/meal-generation.service.ts` (passar `nutritionistId` em `generate` e `adjust`)
- Modify: `apps/api/src/outside-home/outside-home.service.ts` (buscar `patient.nutritionistId` + passar)
- Modify: `apps/api/src/silhueta/silhueta.service.ts` (resolver + passar `nutritionistId`)
- Modify: `apps/api/src/patients/audios/audios.service.ts` (resolver + passar `nutritionistId`)
- Test: `apps/api/src/ai/ai-interactions.service.spec.ts` (persiste `nutritionistId`)

**Interfaces:**
- Consumes: `resolveScopeNutritionistId` (nas services de silhueta/audios/adjust).
- Produces: `RecordInteractionInput.nutritionistId?`, `GenerateStructuredOptions.nutritionistId?`, `transcribeAudio(opts.nutritionistId?)`.

- [ ] **Step 1: Teste — record persiste nutritionistId (falha primeiro)**

```ts
// apps/api/src/ai/ai-interactions.service.spec.ts
import { AiInteractionsService } from './ai-interactions.service';
import { AIInteractionType } from '../generated/prisma/client';

describe('AiInteractionsService.record', () => {
  it('persiste nutritionistId quando informado', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { aIInteraction: { create } } as any;
    const svc = new AiInteractionsService(prisma);
    await svc.record({
      type: AIInteractionType.MEAL_PLAN_GENERATION,
      model: 'gpt-4o',
      input: { system: 's', user: 'u' },
      success: true,
      nutritionistId: 'n1',
      patientId: 'p1',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nutritionistId: 'n1', patientId: 'p1' }) }),
    );
  });
});
```

Run: `pnpm --filter @nutri-plus/api test ai-interactions.service`
Expected: FAIL (campo `nutritionistId` não existe em `RecordInteractionInput`/data).

- [ ] **Step 2: Adicionar `nutritionistId?` ao input + persistir**

Em `ai-interactions.service.ts`, na interface `RecordInteractionInput` adicionar `nutritionistId?: string;` (após `patientId?`), e no `data: {}` do `create` adicionar `nutritionistId: data.nutritionistId,` (ao lado de `patientId: data.patientId,`).

- [ ] **Step 3: Adicionar `nutritionistId?` a `GenerateStructuredOptions`**

Em `apps/api/src/ai/types/ai.types.ts`, na interface `GenerateStructuredOptions<T>` adicionar `nutritionistId?: string;` (ao lado de `patientId?`).

- [ ] **Step 4: Thread no provider**

Em `openai.provider.ts`:
- `generateStructured`: no objeto `common` adicionar `nutritionistId: opts.nutritionistId,` e no `record()` do `catch` (falha) adicionar `nutritionistId: opts.nutritionistId,`.
- `transcribeAudio`: mudar a assinatura para `opts: { patientId?: string; durationSec?: number | null; nutritionistId?: string }` e adicionar `nutritionistId: opts.nutritionistId,` nos dois `record()` (falha e sucesso).

- [ ] **Step 5: Passar nas services**

`meal-generation.service.ts`:
- em `generate`, no `generateStructured({...})` adicionar `nutritionistId,` (já existe a variável).
- em `adjust`, adicionar no topo `const nutritionistId = resolveScopeNutritionistId(ctx);` e incluir `nutritionistId,` no `generateStructured({...})`.

`outside-home.service.ts`:
- ao buscar o `profile` adicionar `nutritionistId: true` ao `select`; passar `nutritionistId: profile?.nutritionistId ?? undefined,` no `generateStructured({...})`. *(Só carimba — não bloqueia.)*

`silhueta.service.ts` e `patients/audios/audios.service.ts`:
- garantir `const nutritionistId = resolveScopeNutritionistId(ctx);` (usar o já existente se houver) e passá-lo à chamada do provider (`generateStructured` / `transcribeAudio`) como `nutritionistId`.

- [ ] **Step 6: Rodar teste + tsc**

Run: `pnpm --filter @nutri-plus/api test ai-interactions.service && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: PASS + tsc limpo.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/ai apps/api/src/meal-generation/meal-generation.service.ts apps/api/src/outside-home/outside-home.service.ts apps/api/src/silhueta/silhueta.service.ts apps/api/src/patients/audios/audios.service.ts
git commit -m "feat(api): carimbar nutritionistId em toda AIInteraction (medição por tenant)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: AI — enforcement de cota/cap inline

**Files:**
- Modify: `apps/api/src/meal-generation/meal-generation.service.ts` (inject `EntitlementsService`; `assertAiActionQuota`)
- Modify: `apps/api/src/meal-generation/meal-generation.module.ts` (import `BillingModule`)
- Modify: `apps/api/src/silhueta/silhueta.service.ts` + `silhueta.module.ts` (inject + `assertUsageCap('silhueta')`)
- Modify: `apps/api/src/patients/audios/audios.service.ts` + `audios.module.ts` (inject + `assertUsageCap('transcription')`)
- Modify: `apps/api/src/employees/employees.service.ts` + `employees.module.ts` (inject + `assertSeatAvailable` em `inviteEmployee`)
- Test: `apps/api/src/meal-generation/meal-generation.service.spec.ts` (cota bloqueia antes do provider)

**Interfaces:**
- Consumes: `EntitlementsService` (via `BillingModule`).

- [ ] **Step 1: Teste — cota esgotada bloqueia antes da OpenAI (falha primeiro)**

Adicionar ao `meal-generation.service.spec.ts` (mockar `EntitlementsService` e o `OpenAIProvider`):

```ts
it('não chama a OpenAI quando a cota está esgotada', async () => {
  const provider = { generateStructured: jest.fn() } as any;
  const entitlements = {
    assertAiActionQuota: jest.fn().mockRejectedValue(new Error('quota')),
  } as any;
  const prisma = {
    patientProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', nutritionistId: 'n1', height: 170, birthDate: new Date('1990-01-01'), gender: 'MALE', objective: 'MAINTAIN', activityLevel: 'MODERATE', assessments: [{ weight: 70, basalMetabolicRate: 1600 }] }) },
    nutritionistProfile: { findUnique: jest.fn().mockResolvedValue({ mealPlanAiInstructions: null }) },
  } as any;
  const svc = new MealGenerationService(prisma, provider, {} as any, entitlements);
  await expect(svc.generate({ user: { role: 'NUTRITIONIST', nutritionistProfile: { id: 'n1' } } } as any, 'p1')).rejects.toThrow('quota');
  expect(provider.generateStructured).not.toHaveBeenCalled();
});
```

*(Nota p/ o implementador: o construtor do `MealGenerationService` ganha um 4º parâmetro `entitlements`. Ajuste os demais testes existentes que instanciam o serviço para passar um stub `{ assertAiActionQuota: jest.fn() }`.)*

Run: `pnpm --filter @nutri-plus/api test meal-generation.service`
Expected: FAIL (assertAiActionQuota inexistente / provider chamado).

- [ ] **Step 2: Injetar e chamar assertAiActionQuota**

Em `meal-generation.service.ts`:
- adicionar ao construtor `private readonly entitlements: EntitlementsService,` (import de `../billing/entitlements.service`).
- em `generate`, logo após `const nutritionistId = resolveScopeNutritionistId(ctx);` e antes do `generateStructured`, chamar `await this.entitlements.assertAiActionQuota(nutritionistId);`.
- em `adjust`, após resolver `nutritionistId` (Task 5), antes do `generateStructured`, chamar `await this.entitlements.assertAiActionQuota(nutritionistId);`.

Em `meal-generation.module.ts`: adicionar `BillingModule` ao `imports`.

- [ ] **Step 3: Caps de silhueta/transcrição + assento**

`silhueta.service.ts` — injetar `EntitlementsService`; antes da chamada de visão ao provider: `await this.entitlements.assertUsageCap(nutritionistId, 'silhueta');`. `silhueta.module.ts` → import `BillingModule`.

`patients/audios/audios.service.ts` — injetar `EntitlementsService`; em `transcribe`, antes de `transcribeAudio`: `await this.entitlements.assertUsageCap(nutritionistId, 'transcription');`. `audios.module.ts` → import `BillingModule`.

`employees/employees.service.ts` — injetar `EntitlementsService`; em `inviteEmployee`, após `const nutritionistId = resolveScopeNutritionistId(ctx);` e antes de criar o convite: `await this.entitlements.assertSeatAvailable(nutritionistId);`. `employees.module.ts` → import `BillingModule`.

- [ ] **Step 4: Rodar testes da área + tsc**

Run: `pnpm --filter @nutri-plus/api test meal-generation.service silhueta audios employees && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: PASS + tsc limpo. *(Ajustar instanciações de teste que passaram a exigir o stub de entitlements.)*

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/meal-generation apps/api/src/silhueta apps/api/src/patients/audios apps/api/src/employees
git commit -m "feat(api): enforcement inline de cota de IA, caps e assentos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Asaas — AsaasService (cliente fetch) + env

**Files:**
- Modify: `apps/api/src/config/env.schema.ts` (3 vars Asaas)
- Create: `apps/api/src/billing/asaas.service.ts`
- Test: `apps/api/src/billing/asaas.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService`.
- Produces: `AsaasService`:
  - `ensureCustomer(input: { name: string; email: string; cpfCnpj: string }): Promise<string>` (retorna `asaasCustomerId`)
  - `createSubscription(input: { customerId: string; value: number; cycle: 'MONTHLY' | 'YEARLY'; description: string }): Promise<{ subscriptionId: string; invoiceUrl: string }>`
  - `cancelSubscription(subscriptionId: string): Promise<void>`

- [ ] **Step 1: Env schema**

Em `env.schema.ts`, dentro do `z.object({...})`, adicionar (seguindo o padrão `.optional()` de `REMINDER_DISPATCH_KEY`):

```ts
  ASAAS_API_KEY: z.string().min(1).optional(),
  ASAAS_API_URL: z.string().url().optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().min(1).optional(),
```

- [ ] **Step 2: Teste do AsaasService (falha primeiro)**

```ts
// apps/api/src/billing/asaas.service.spec.ts
import { AsaasService } from './asaas.service';

function config(map: Record<string, string>) {
  return { getOrThrow: (k: string) => { if (!map[k]) throw new Error(`missing ${k}`); return map[k]; } } as any;
}
const CFG = { ASAAS_API_URL: 'https://api-sandbox.asaas.com/v3', ASAAS_API_KEY: 'key_123' };

describe('AsaasService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('ensureCustomer faz POST /customers com access_token e retorna id', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true, status: 200, text: async () => JSON.stringify({ id: 'cus_1' }),
    } as any);
    const id = await new AsaasService(config(CFG)).ensureCustomer({ name: 'A', email: 'a@x.com', cpfCnpj: '123' });
    expect(id).toBe('cus_1');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api-sandbox.asaas.com/v3/customers');
    expect((opts as any).headers.access_token).toBe('key_123');
  });

  it('createSubscription cria a assinatura e busca o invoiceUrl do 1º pagamento', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ id: 'sub_1' }) } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ data: [{ invoiceUrl: 'https://asaas/inv/1' }] }) } as any);
    const out = await new AsaasService(config(CFG)).createSubscription({ customerId: 'cus_1', value: 49, cycle: 'MONTHLY', description: 'Essencial' });
    expect(out).toEqual({ subscriptionId: 'sub_1', invoiceUrl: 'https://asaas/inv/1' });
    expect((fetchMock.mock.calls[0][0] as string)).toBe('https://api-sandbox.asaas.com/v3/subscriptions');
    expect((fetchMock.mock.calls[1][0] as string)).toContain('/subscriptions/sub_1/payments');
  });

  it('lança erro claro quando a API do Asaas responde não-ok', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 400, text: async () => '{"errors":[{"description":"bad"}]}' } as any);
    await expect(new AsaasService(config(CFG)).ensureCustomer({ name: 'A', email: 'a@x.com', cpfCnpj: '1' }))
      .rejects.toThrow();
  });
});
```

Run: `pnpm --filter @nutri-plus/api test asaas.service`
Expected: FAIL (serviço não existe).

- [ ] **Step 3: Implementar o AsaasService**

```ts
// apps/api/src/billing/asaas.service.ts
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);
  constructor(private readonly config: ConfigService) {}

  private base(): string { return this.config.getOrThrow<string>('ASAAS_API_URL'); }
  private key(): string { return this.config.getOrThrow<string>('ASAAS_API_KEY'); }

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
      this.logger.warn(`Asaas ${init.method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
      throw new BadGatewayException('Falha ao falar com o Asaas');
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  // Data de hoje (America/Sao_Paulo) em 'YYYY-MM-DD' para nextDueDate.
  private todaySaoPaulo(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }

  async ensureCustomer(input: { name: string; email: string; cpfCnpj: string }): Promise<string> {
    const c = await this.call<{ id: string }>('/customers', { method: 'POST', body: input });
    return c.id;
  }

  async createSubscription(input: {
    customerId: string; value: number; cycle: 'MONTHLY' | 'YEARLY'; description: string;
  }): Promise<{ subscriptionId: string; invoiceUrl: string }> {
    const sub = await this.call<{ id: string }>('/subscriptions', {
      method: 'POST',
      body: {
        customer: input.customerId,
        billingType: 'UNDEFINED', // cliente escolhe Pix/cartão na página hospedada
        value: input.value,
        cycle: input.cycle,
        nextDueDate: this.todaySaoPaulo(),
        description: input.description,
      },
    });
    const payments = await this.call<{ data: { invoiceUrl: string }[] }>(
      `/subscriptions/${sub.id}/payments`, { method: 'GET' },
    );
    const invoiceUrl = payments.data[0]?.invoiceUrl;
    if (!invoiceUrl) throw new BadGatewayException('Asaas não retornou a cobrança inicial');
    return { subscriptionId: sub.id, invoiceUrl };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.call(`/subscriptions/${subscriptionId}`, { method: 'DELETE' });
  }
}
```

- [ ] **Step 4: Rodar teste**

Run: `pnpm --filter @nutri-plus/api test asaas.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/env.schema.ts apps/api/src/billing/asaas.service.ts apps/api/src/billing/asaas.service.spec.ts
git commit -m "feat(api): AsaasService (customer/subscription/cancel via fetch) + env

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: billing — SubscriptionService (view/checkout/cancel) + me/subscription controller

**Files:**
- Create: `apps/api/src/billing/dto/checkout.dto.ts`
- Create: `apps/api/src/billing/subscription.service.ts`
- Create: `apps/api/src/billing/me-subscription.controller.ts`
- Modify: `apps/api/src/billing/billing.module.ts` (registrar service+controller+AsaasService+ConfigModule)
- Test: `apps/api/src/billing/subscription.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `EntitlementsService`, `AsaasService`; `PLAN_CATALOG`, `CheckoutRequest/Response`, `SubscriptionView`.
- Produces: `SubscriptionService`:
  - `getView(nutritionistId: string): Promise<SubscriptionView>`
  - `checkout(nutritionistId: string, dto: CheckoutRequest, customer: { name: string; email: string }): Promise<CheckoutResponse>`
  - `cancel(nutritionistId: string): Promise<void>`
  - `handleWebhook(...)` fica na Task 9.

- [ ] **Step 1: DTO de checkout**

```ts
// apps/api/src/billing/dto/checkout.dto.ts
import { IsIn, IsString, Matches } from 'class-validator';
import type { BillingPeriod, PlanTier } from '@nutri-plus/shared-types';

export class CheckoutDto {
  @IsIn(['ESSENCIAL', 'PRO'])
  plan!: PlanTier;

  @IsIn(['MONTHLY', 'YEARLY'])
  period!: BillingPeriod;

  // CPF (11) ou CNPJ (14), só dígitos após normalização no cliente.
  @IsString()
  @Matches(/^\d{11}$|^\d{14}$/, { message: 'cpfCnpj deve ter 11 (CPF) ou 14 (CNPJ) dígitos' })
  cpfCnpj!: string;
}
```

- [ ] **Step 2: Teste do SubscriptionService (falha primeiro)**

```ts
// apps/api/src/billing/subscription.service.spec.ts
import { SubscriptionService } from './subscription.service';

function deps(sub: any) {
  const prisma = {
    subscription: {
      findUnique: jest.fn().mockResolvedValue(sub),
      update: jest.fn().mockResolvedValue({}),
    },
    subscriptionPayment: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
  const entitlements = { getEntitlements: jest.fn().mockResolvedValue({ tier: 'PRO', isReadOnly: false, features: {}, aiQuota: 200, aiUsed: 1 }) } as any;
  const asaas = {
    ensureCustomer: jest.fn().mockResolvedValue('cus_1'),
    createSubscription: jest.fn().mockResolvedValue({ subscriptionId: 'sub_1', invoiceUrl: 'https://asaas/inv' }),
    cancelSubscription: jest.fn().mockResolvedValue(undefined),
  } as any;
  return { prisma, entitlements, asaas, svc: new SubscriptionService(prisma, entitlements, asaas) };
}

describe('SubscriptionService.checkout', () => {
  it('cria customer (quando não há) + assinatura Asaas, guarda ids/plano e retorna invoiceUrl', async () => {
    const { svc, prisma, asaas } = deps({ id: 's1', nutritionistId: 'n1', asaasCustomerId: null, asaasSubscriptionId: null });
    const out = await svc.checkout('n1', { plan: 'ESSENCIAL', period: 'MONTHLY', cpfCnpj: '12345678901' }, { name: 'A', email: 'a@x.com' });
    expect(out).toEqual({ invoiceUrl: 'https://asaas/inv' });
    expect(asaas.ensureCustomer).toHaveBeenCalled();
    expect(asaas.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ value: 49, cycle: 'MONTHLY', customerId: 'cus_1' }));
    expect(prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ asaasSubscriptionId: 'sub_1', plan: 'ESSENCIAL', billingPeriod: 'MONTHLY' }),
    }));
  });

  it('reutiliza asaasCustomerId existente e cancela a assinatura anterior antes de trocar', async () => {
    const { svc, asaas } = deps({ id: 's1', nutritionistId: 'n1', asaasCustomerId: 'cus_9', asaasSubscriptionId: 'sub_old' });
    await svc.checkout('n1', { plan: 'PRO', period: 'YEARLY', cpfCnpj: '12345678901' }, { name: 'A', email: 'a@x.com' });
    expect(asaas.ensureCustomer).not.toHaveBeenCalled();
    expect(asaas.cancelSubscription).toHaveBeenCalledWith('sub_old');
    expect(asaas.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ value: 990, cycle: 'YEARLY' }));
  });
});

describe('SubscriptionService.cancel', () => {
  it('cancela no Asaas e marca cancelAtPeriodEnd', async () => {
    const { svc, prisma, asaas } = deps({ id: 's1', nutritionistId: 'n1', asaasSubscriptionId: 'sub_1' });
    await svc.cancel('n1');
    expect(asaas.cancelSubscription).toHaveBeenCalledWith('sub_1');
    expect(prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cancelAtPeriodEnd: true }) }));
  });
});
```

Run: `pnpm --filter @nutri-plus/api test subscription.service`
Expected: FAIL.

- [ ] **Step 3: Implementar o SubscriptionService**

```ts
// apps/api/src/billing/subscription.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { CheckoutRequest, CheckoutResponse, SubscriptionView } from '@nutri-plus/shared-types';
import { PLAN_CATALOG } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from './entitlements.service';
import { AsaasService } from './asaas.service';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly asaas: AsaasService,
  ) {}

  async getView(nutritionistId: string): Promise<SubscriptionView> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub) throw new NotFoundException('Assinatura não encontrada');
    const entitlements = await this.entitlements.getEntitlements(nutritionistId);
    const payments = await this.prisma.subscriptionPayment.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    return {
      status: sub.status,
      isComp: sub.isComp,
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      plan: sub.plan,
      billingPeriod: sub.billingPeriod,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      entitlements,
      recentPayments: payments.map((p) => ({
        id: p.id, amount: p.amount, status: p.status, billingType: p.billingType,
        dueDate: p.dueDate?.toISOString() ?? null, paidAt: p.paidAt?.toISOString() ?? null,
      })),
    };
  }

  async checkout(
    nutritionistId: string,
    dto: CheckoutRequest,
    customer: { name: string; email: string },
  ): Promise<CheckoutResponse> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub) throw new NotFoundException('Assinatura não encontrada');

    let customerId = sub.asaasCustomerId;
    if (!customerId) {
      customerId = await this.asaas.ensureCustomer({ ...customer, cpfCnpj: dto.cpfCnpj });
    }
    // Troca de plano: encerra a assinatura Asaas anterior antes de criar a nova.
    if (sub.asaasSubscriptionId) {
      await this.asaas.cancelSubscription(sub.asaasSubscriptionId);
    }

    const cfg = PLAN_CATALOG[dto.plan];
    const value = dto.period === 'MONTHLY' ? cfg.monthlyBrl : cfg.yearlyBrl;
    const { subscriptionId, invoiceUrl } = await this.asaas.createSubscription({
      customerId, value, cycle: dto.period, description: `nutri_plus ${dto.plan}`,
    });

    // status permanece como está (TRIALING/PAST_DUE) até o webhook confirmar o pagamento.
    await this.prisma.subscription.update({
      where: { nutritionistId },
      data: { asaasCustomerId: customerId, asaasSubscriptionId: subscriptionId, plan: dto.plan, billingPeriod: dto.period, cancelAtPeriodEnd: false },
    });
    return { invoiceUrl };
  }

  async cancel(nutritionistId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub) throw new NotFoundException('Assinatura não encontrada');
    if (sub.asaasSubscriptionId) {
      await this.asaas.cancelSubscription(sub.asaasSubscriptionId);
    }
    await this.prisma.subscription.update({ where: { nutritionistId }, data: { cancelAtPeriodEnd: true } });
  }
}
```

- [ ] **Step 4: Controller me/subscription**

```ts
// apps/api/src/billing/me-subscription.controller.ts
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { CheckoutResponse, SubscriptionView } from '@nutri-plus/shared-types';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { BillingExempt } from './decorators';
import { SubscriptionService } from './subscription.service';
import { CheckoutDto } from './dto/checkout.dto';

@ApiTags('subscription')
@ApiBearerAuth()
@Controller({ path: 'me/subscription', version: '1' })
@Roles(UserRole.NUTRITIONIST)
@BillingExempt() // as próprias rotas de billing nunca podem ser bloqueadas pelo guard
export class MeSubscriptionController {
  constructor(private readonly subscription: SubscriptionService) {}

  @Get()
  getView(@CurrentUser() ctx: AuthContext): Promise<SubscriptionView> {
    return this.subscription.getView(resolveScopeNutritionistId(ctx));
  }

  @Post('checkout')
  checkout(@CurrentUser() ctx: AuthContext, @Body() dto: CheckoutDto): Promise<CheckoutResponse> {
    return this.subscription.checkout(resolveScopeNutritionistId(ctx), dto, {
      name: ctx.name, email: ctx.email,
    });
  }

  @Post('cancel')
  async cancel(@CurrentUser() ctx: AuthContext): Promise<{ ok: true }> {
    await this.subscription.cancel(resolveScopeNutritionistId(ctx));
    return { ok: true };
  }
}
```

- [ ] **Step 5: Registrar no módulo**

Em `billing.module.ts`: importar `ConfigModule` (de `@nestjs/config`) no `imports`, adicionar `AsaasService` e `SubscriptionService` aos `providers`, `MeSubscriptionController` aos `controllers`, e exportar `SubscriptionService`.

- [ ] **Step 6: Rodar teste + tsc**

Run: `pnpm --filter @nutri-plus/api test subscription.service && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: PASS + tsc limpo.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/billing/dto/checkout.dto.ts apps/api/src/billing/subscription.service.ts apps/api/src/billing/me-subscription.controller.ts apps/api/src/billing/subscription.service.spec.ts apps/api/src/billing/billing.module.ts
git commit -m "feat(api): me/subscription (view + checkout + cancel via Asaas)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Asaas — webhook (transições idempotentes + SubscriptionPayment)

**Files:**
- Create: `apps/api/src/billing/internal-asaas.controller.ts`
- Modify: `apps/api/src/billing/subscription.service.ts` (`handleWebhook`)
- Modify: `apps/api/src/billing/billing.module.ts` (registrar controller)
- Test: `apps/api/src/billing/subscription-webhook.spec.ts`

**Interfaces:**
- Consumes: `ConfigService` (`ASAAS_WEBHOOK_TOKEN`), `PrismaService`.
- Produces: `SubscriptionService.handleWebhook(event: AsaasWebhookEvent): Promise<void>`; `InternalAsaasController` (`@Public`, header `asaas-access-token`).

- [ ] **Step 1: Teste do webhook (falha primeiro)**

```ts
// apps/api/src/billing/subscription-webhook.spec.ts
import { SubscriptionService } from './subscription.service';

function svcWith(sub: any) {
  const prisma = {
    subscription: { findFirst: jest.fn().mockResolvedValue(sub), update: jest.fn().mockResolvedValue({}) },
    subscriptionPayment: { upsert: jest.fn().mockResolvedValue({}) },
  } as any;
  return { prisma, svc: new SubscriptionService(prisma, {} as any, {} as any) };
}
const payment = { id: 'pay_1', subscription: 'sub_1', value: 49, status: 'CONFIRMED', billingType: 'PIX', dueDate: '2026-08-10', paymentDate: '2026-08-04' };

describe('SubscriptionService.handleWebhook', () => {
  it('PAYMENT_CONFIRMED → ACTIVE + upsert do pagamento (idempotente por asaasPaymentId)', async () => {
    const { svc, prisma } = svcWith({ id: 's1', billingPeriod: 'MONTHLY' });
    await svc.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment });
    expect(prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }));
    expect(prisma.subscriptionPayment.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { asaasPaymentId: 'pay_1' } }));
  });

  it('PAYMENT_OVERDUE → PAST_DUE', async () => {
    const { svc, prisma } = svcWith({ id: 's1', billingPeriod: 'MONTHLY' });
    await svc.handleWebhook({ event: 'PAYMENT_OVERDUE', payment: { ...payment, status: 'OVERDUE' } });
    expect(prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PAST_DUE' }) }));
  });

  it('assinatura desconhecida → no-op (não explode)', async () => {
    const { svc, prisma } = svcWith(null);
    await svc.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment });
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm --filter @nutri-plus/api test subscription-webhook`
Expected: FAIL.

- [ ] **Step 2: Implementar handleWebhook (append no SubscriptionService)**

Adicionar o tipo e o método ao `subscription.service.ts`:

```ts
export interface AsaasWebhookEvent {
  event: string;
  payment?: {
    id: string; subscription?: string; value: number; status: string;
    billingType?: string; dueDate?: string; paymentDate?: string;
  };
}

// dentro da classe SubscriptionService:
async handleWebhook(event: AsaasWebhookEvent): Promise<void> {
  const p = event.payment;
  if (!p?.subscription) return;
  const sub = await this.prisma.subscription.findFirst({ where: { asaasSubscriptionId: p.subscription } });
  if (!sub) return; // assinatura não é nossa / ainda não persistida

  await this.prisma.subscriptionPayment.upsert({
    where: { asaasPaymentId: p.id },
    create: {
      subscriptionId: sub.id, asaasPaymentId: p.id, amount: p.value, status: p.status,
      billingType: p.billingType ?? null,
      dueDate: p.dueDate ? new Date(p.dueDate) : null,
      paidAt: p.paymentDate ? new Date(p.paymentDate) : null,
    },
    update: {
      status: p.status,
      paidAt: p.paymentDate ? new Date(p.paymentDate) : null,
    },
  });

  if (event.event === 'PAYMENT_CONFIRMED' || event.event === 'PAYMENT_RECEIVED') {
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'ACTIVE', currentPeriodEnd: this.nextPeriodEnd(sub.billingPeriod, p.dueDate) },
    });
  } else if (event.event === 'PAYMENT_OVERDUE') {
    await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
  } else if (event.event === 'PAYMENT_REFUNDED' || event.event === 'SUBSCRIPTION_DELETED') {
    await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELED' } });
  }
}

private nextPeriodEnd(period: 'MONTHLY' | 'YEARLY' | null, dueDate?: string): Date {
  const base = dueDate ? new Date(dueDate) : new Date();
  const end = new Date(base);
  if (period === 'YEARLY') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}
```

- [ ] **Step 3: Controller do webhook (fail-closed)**

```ts
// apps/api/src/billing/internal-asaas.controller.ts
import { Body, Controller, ForbiddenException, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { SubscriptionService, AsaasWebhookEvent } from './subscription.service';

@Controller({ path: 'internal/asaas', version: '1' })
export class InternalAsaasController {
  constructor(
    private readonly subscription: SubscriptionService,
    private readonly config: ConfigService,
  ) {}

  @Post('webhook')
  @Public()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Headers('asaas-access-token') token: string | undefined,
    @Body() event: AsaasWebhookEvent,
  ): Promise<{ ok: true }> {
    const expected = this.config.getOrThrow<string>('ASAAS_WEBHOOK_TOKEN');
    if (!token || token !== expected) {
      throw new ForbiddenException('invalid webhook token');
    }
    await this.subscription.handleWebhook(event);
    return { ok: true };
  }
}
```

*(Fail-closed: `getOrThrow` garante que sem `ASAAS_WEBHOOK_TOKEN` configurado o endpoint recusa tudo; token ausente/errado → 403.)*

- [ ] **Step 4: Registrar o controller no módulo**

Em `billing.module.ts`, adicionar `InternalAsaasController` ao array `controllers`.

- [ ] **Step 5: Rodar teste + tsc**

Run: `pnpm --filter @nutri-plus/api test subscription-webhook && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: PASS + tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/billing/internal-asaas.controller.ts apps/api/src/billing/subscription.service.ts apps/api/src/billing/subscription-webhook.spec.ts apps/api/src/billing/billing.module.ts
git commit -m "feat(api): webhook Asaas (transições idempotentes + SubscriptionPayment)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Semeadura — trial 7d no signup + cortesia 30d (migração)

**Files:**
- Modify: `apps/api/src/users/users.service.ts` (seed trial em `createNutritionist`)
- Create: `apps/api/src/billing/seed-subscriptions.ts` (função pura `seedCourtesySubscriptions`)
- Create: `apps/api/scripts/seed-subscriptions.ts` (runner one-off)
- Test: `apps/api/src/users/users.service.spec.ts` (signup semeia trial) + `apps/api/src/billing/seed-subscriptions.spec.ts`

**Interfaces:**
- Consumes: `TRIAL_DAYS`, `COURTESY_DAYS` (plan-policy).
- Produces: `seedCourtesySubscriptions(prisma, compEmails: string[], days: number): Promise<{ created: number; comped: number }>`.

- [ ] **Step 1: Teste — signup de nutricionista semeia trial (falha primeiro)**

Adicionar ao `users.service.spec.ts` (mockando `prisma.user.create` p/ capturar o `data`):

```ts
it('createWithProfile(NUTRITIONIST) cria assinatura TRIALING com trialEndsAt ~ +7d', async () => {
  const create = jest.fn().mockResolvedValue({ id: 'u1' });
  const prisma = { user: { create } } as any;
  const svc = new UsersService(prisma);
  await svc.createWithProfile({ authProviderId: 'a1', email: 'n@x.com', name: 'N', role: 'NUTRITIONIST' as any });
  const data = create.mock.calls[0][0].data;
  const trialEndsAt: Date = data.nutritionistProfile.create.subscription.create.trialEndsAt;
  const days = (trialEndsAt.getTime() - Date.now()) / (24 * 3600 * 1000);
  expect(data.nutritionistProfile.create.subscription.create.status).toBe('TRIALING');
  expect(days).toBeGreaterThan(6.9);
  expect(days).toBeLessThan(7.1);
});
```

Run: `pnpm --filter @nutri-plus/api test users.service`
Expected: FAIL (sem `subscription` no nested create).

- [ ] **Step 2: Semear o trial no createNutritionist**

Em `users.service.ts`, importar `import { TRIAL_DAYS } from '../billing/plan-policy';` e no `createNutritionist`, no `nutritionistProfile: { create: { referralCode: generateReferralCode() } }`, incluir a assinatura aninhada:

```ts
            nutritionistProfile: {
              create: {
                referralCode: generateReferralCode(),
                subscription: {
                  create: {
                    status: 'TRIALING',
                    trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000),
                  },
                },
              },
            },
```

- [ ] **Step 3: Teste da função de cortesia (falha primeiro)**

```ts
// apps/api/src/billing/seed-subscriptions.spec.ts
import { seedCourtesySubscriptions } from './seed-subscriptions';

it('cria assinatura de cortesia só para nutris sem assinatura; marca comp por e-mail', async () => {
  const prisma = {
    nutritionistProfile: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'n1', subscription: null, user: { email: 'a@x.com' } },
        { id: 'n2', subscription: { id: 's2' }, user: { email: 'b@x.com' } }, // já tem → pula
        { id: 'n3', subscription: null, user: { email: 'founder@x.com' } },
      ]),
    },
    subscription: { create: jest.fn().mockResolvedValue({}) },
  } as any;
  const out = await seedCourtesySubscriptions(prisma, ['founder@x.com'], 30);
  expect(out).toEqual({ created: 2, comped: 1 });
  expect(prisma.subscription.create).toHaveBeenCalledTimes(2);
  const comped = prisma.subscription.create.mock.calls.find((c: any) => c[0].data.nutritionistId === 'n3')[0].data;
  expect(comped.isComp).toBe(true);
});
```

Run: `pnpm --filter @nutri-plus/api test seed-subscriptions`
Expected: FAIL.

- [ ] **Step 4: Implementar a função pura**

```ts
// apps/api/src/billing/seed-subscriptions.ts
import type { PrismaClient } from '../generated/prisma/client';

// Idempotente: só cria para nutricionistas SEM assinatura. comp por e-mail → Pro permanente.
export async function seedCourtesySubscriptions(
  prisma: Pick<PrismaClient, 'nutritionistProfile' | 'subscription'>,
  compEmails: string[],
  days: number,
): Promise<{ created: number; comped: number }> {
  const compSet = new Set(compEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const nutris = await (prisma.nutritionistProfile as any).findMany({
    include: { subscription: true, user: { select: { email: true } } },
  });
  let created = 0;
  let comped = 0;
  for (const n of nutris) {
    if (n.subscription) continue;
    const isComp = compSet.has(String(n.user?.email ?? '').toLowerCase());
    await (prisma.subscription as any).create({
      data: {
        nutritionistId: n.id,
        status: 'TRIALING',
        isComp,
        trialEndsAt: new Date(Date.now() + days * 24 * 3600 * 1000),
      },
    });
    created++;
    if (isComp) comped++;
  }
  return { created, comped };
}
```

- [ ] **Step 5: Runner one-off**

```ts
// apps/api/scripts/seed-subscriptions.ts
import { PrismaClient } from '../src/generated/prisma/client';
import { seedCourtesySubscriptions } from '../src/billing/seed-subscriptions';
import { COURTESY_DAYS } from '../src/billing/plan-policy';

async function main() {
  const prisma = new PrismaClient();
  const compEmails = (process.env.COMP_NUTRITIONIST_EMAILS ?? '').split(',');
  try {
    const out = await seedCourtesySubscriptions(prisma, compEmails, COURTESY_DAYS);
    console.log(`Cortesia semeada: created=${out.created} comped=${out.comped}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

*(Rodar no deploy uma vez: `COMP_NUTRITIONIST_EMAILS="paulo@empathmsp.com" pnpm --filter @nutri-plus/api run seed:subscriptions`. Requer o script `"seed:subscriptions": "ts-node scripts/seed-subscriptions.ts"` em `apps/api/package.json` — `tsx` não está instalado no projeto, `ts-node` já é devDependency. É idempotente — rodar duas vezes não duplica.)*

- [ ] **Step 6: Rodar testes + tsc**

Run: `pnpm --filter @nutri-plus/api test users.service seed-subscriptions && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: PASS + tsc limpo.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.service.spec.ts apps/api/src/billing/seed-subscriptions.ts apps/api/src/billing/seed-subscriptions.spec.ts apps/api/scripts/seed-subscriptions.ts
git commit -m "feat(api): trial 7d no signup + script de cortesia 30d (comp allowlist)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Web — camada de dados da assinatura (api + query + 402 parser)

**Files:**
- Create: `apps/web/src/lib/api/subscription.ts`
- Create: `apps/web/src/lib/queries/subscription.ts`
- Create: `apps/web/src/lib/api/billing-errors.ts`
- Test: `apps/web/src/lib/api/billing-errors.test.ts`

**Interfaces:**
- Consumes: `browserApiFetch`; `ApiError` (`lib/api/client`); `SubscriptionView`, `CheckoutRequest`, `CheckoutResponse`, `BillingErrorCode`, `PlanFeature`.
- Produces: `getSubscription()`, `checkoutSubscription(body)`, `cancelSubscription()`; `useSubscription()`, `SUBSCRIPTION_KEY`; `billingErrorFrom(err)`.

- [ ] **Step 1: API client**

```ts
// apps/web/src/lib/api/subscription.ts
import type { CheckoutRequest, CheckoutResponse, SubscriptionView } from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function getSubscription(): Promise<SubscriptionView> {
  return browserApiFetch<SubscriptionView>('/me/subscription');
}

export function checkoutSubscription(body: CheckoutRequest): Promise<CheckoutResponse> {
  return browserApiFetch<CheckoutResponse>('/me/subscription/checkout', { method: 'POST', body });
}

export function cancelSubscription(): Promise<{ ok: true }> {
  return browserApiFetch<{ ok: true }>('/me/subscription/cancel', { method: 'POST' });
}
```

- [ ] **Step 2: react-query hook**

```ts
// apps/web/src/lib/queries/subscription.ts
import { useQuery } from '@tanstack/react-query';
import { getSubscription } from '@/lib/api/subscription';

export const SUBSCRIPTION_KEY = ['subscription'] as const;

export function useSubscription() {
  return useQuery({ queryKey: SUBSCRIPTION_KEY, queryFn: getSubscription, staleTime: 30_000 });
}
```

- [ ] **Step 3: Teste do 402 parser (falha primeiro)**

```ts
// apps/web/src/lib/api/billing-errors.test.ts
import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { billingErrorFrom } from '@/lib/api/billing-errors';

describe('billingErrorFrom', () => {
  it('extrai code/feature de um ApiError 402', () => {
    const err = new ApiError(402, { statusCode: 402, code: 'FEATURE_PRO_ONLY', feature: 'silhueta' });
    expect(billingErrorFrom(err)).toEqual({ code: 'FEATURE_PRO_ONLY', feature: 'silhueta' });
  });
  it('READ_ONLY sem feature', () => {
    expect(billingErrorFrom(new ApiError(402, { code: 'READ_ONLY' }))).toEqual({ code: 'READ_ONLY', feature: undefined });
  });
  it('ignora não-402 e não-ApiError', () => {
    expect(billingErrorFrom(new ApiError(403, { code: 'READ_ONLY' }))).toBeNull();
    expect(billingErrorFrom(new Error('x'))).toBeNull();
  });
});
```

Run: `pnpm --filter @nutri-plus/web test billing-errors`
Expected: FAIL.

- [ ] **Step 4: Implementar o parser**

```ts
// apps/web/src/lib/api/billing-errors.ts
import type { BillingErrorCode, PlanFeature } from '@nutri-plus/shared-types';
import { ApiError } from '@/lib/api/client';

const CODES: BillingErrorCode[] = ['READ_ONLY', 'AI_QUOTA_EXCEEDED', 'FEATURE_PRO_ONLY', 'SEAT_LIMIT'];

export function billingErrorFrom(err: unknown): { code: BillingErrorCode; feature?: PlanFeature } | null {
  if (!(err instanceof ApiError) || err.status !== 402) return null;
  const body = err.body as { code?: string; feature?: PlanFeature } | null;
  if (!body || !CODES.includes(body.code as BillingErrorCode)) return null;
  return { code: body.code as BillingErrorCode, feature: body.feature };
}
```

- [ ] **Step 5: Rodar teste**

Run: `pnpm --filter @nutri-plus/web test billing-errors`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api/subscription.ts apps/web/src/lib/queries/subscription.ts apps/web/src/lib/api/billing-errors.ts apps/web/src/lib/api/billing-errors.test.ts
git commit -m "feat(web): camada de dados da assinatura + parser de erro 402

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Web — BillingGate (banners + read-only + modais 402), montado no layout

**Files:**
- Create: `apps/web/src/lib/billing/billing-events.ts`
- Create: `apps/web/src/components/billing/billing-gate.tsx`
- Modify: `apps/web/src/app/providers.tsx` (QueryCache/MutationCache `onError` → `emitBilling`)
- Modify: `apps/web/src/app/(app)/layout.tsx` (montar `<BillingGate/>`)
- Test: `apps/web/src/components/billing/billing-gate.test.tsx`

**Interfaces:**
- Consumes: `billingErrorFrom`, `useSubscription`, `SUBSCRIPTION_KEY`; `useRouter` (next/navigation).
- Produces: `emitBilling(code, feature)`, `onBilling(listener): () => void`; `<BillingGate/>`.

- [ ] **Step 1: Barramento de eventos**

```ts
// apps/web/src/lib/billing/billing-events.ts
import type { BillingErrorCode, PlanFeature } from '@nutri-plus/shared-types';

export type BillingEvent = { code: BillingErrorCode; feature?: PlanFeature };
type Listener = (e: BillingEvent) => void;
const listeners = new Set<Listener>();

export function emitBilling(code: BillingErrorCode, feature?: PlanFeature): void {
  for (const l of listeners) l({ code, feature });
}
export function onBilling(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
```

- [ ] **Step 2: onError global no providers**

Em `providers.tsx`, trocar a criação do `QueryClient` por uma versão com caches que reportam 402 (mantendo o `ThemeProvider`):

```tsx
import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { billingErrorFrom } from '@/lib/api/billing-errors';
import { emitBilling } from '@/lib/billing/billing-events';

function handle(err: unknown) {
  const be = billingErrorFrom(err);
  if (be) emitBilling(be.code, be.feature);
}
// dentro do componente:
const [client] = useState(() => new QueryClient({
  queryCache: new QueryCache({ onError: handle }),
  mutationCache: new MutationCache({ onError: handle }),
}));
```

- [ ] **Step 3: Teste do BillingGate (falha primeiro)**

```tsx
// apps/web/src/components/billing/billing-gate.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const useSubscription = vi.fn();
vi.mock('@/lib/queries/subscription', () => ({ useSubscription: () => useSubscription(), SUBSCRIPTION_KEY: ['subscription'] }));

import { BillingGate } from './billing-gate';
import { emitBilling } from '@/lib/billing/billing-events';

beforeEach(() => { push.mockClear(); });

it('mostra banner de trial com dias restantes', () => {
  const in3 = new Date(Date.now() + 3 * 86400_000).toISOString();
  useSubscription.mockReturnValue({ data: { status: 'TRIALING', isComp: false, trialEndsAt: in3, entitlements: { isReadOnly: false } } });
  render(<BillingGate />);
  expect(screen.getByText(/teste/i)).toBeInTheDocument();
});

it('banner de somente-leitura quando isReadOnly', () => {
  useSubscription.mockReturnValue({ data: { status: 'PAST_DUE', isComp: false, trialEndsAt: null, entitlements: { isReadOnly: true } } });
  render(<BillingGate />);
  expect(screen.getByText(/somente leitura/i)).toBeInTheDocument();
});

it('evento FEATURE_PRO_ONLY abre modal de upsell', () => {
  useSubscription.mockReturnValue({ data: { status: 'ACTIVE', isComp: false, trialEndsAt: null, entitlements: { isReadOnly: false } } });
  render(<BillingGate />);
  act(() => emitBilling('FEATURE_PRO_ONLY', 'silhueta'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('evento READ_ONLY redireciona ao paywall', () => {
  useSubscription.mockReturnValue({ data: { status: 'PAST_DUE', isComp: false, trialEndsAt: null, entitlements: { isReadOnly: true } } });
  render(<BillingGate />);
  act(() => emitBilling('READ_ONLY'));
  expect(push).toHaveBeenCalledWith('/assinatura');
});
```

Run: `pnpm --filter @nutri-plus/web test billing-gate`
Expected: FAIL.

- [ ] **Step 4: Implementar o BillingGate**

```tsx
// apps/web/src/components/billing/billing-gate.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BillingErrorCode, PlanFeature } from '@nutri-plus/shared-types';
import { onBilling } from '@/lib/billing/billing-events';
import { useSubscription } from '@/lib/queries/subscription';

const MODAL_COPY: Record<Exclude<BillingErrorCode, 'READ_ONLY'>, { title: string; body: string }> = {
  AI_QUOTA_EXCEEDED: { title: 'Cota de IA esgotada', body: 'Você usou suas ações de IA deste mês. Faça upgrade para o Pro ou aguarde a renovação no dia 1º.' },
  FEATURE_PRO_ONLY: { title: 'Recurso do plano Pro', body: 'Esse recurso está disponível no plano Pro. Faça upgrade para liberar.' },
  SEAT_LIMIT: { title: 'Limite de funcionários', body: 'Seu plano atingiu o limite de assentos. Faça upgrade para adicionar mais.' },
};

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000));
}

export function BillingGate() {
  const router = useRouter();
  const { data } = useSubscription();
  const [modal, setModal] = useState<{ code: Exclude<BillingErrorCode, 'READ_ONLY'>; feature?: PlanFeature } | null>(null);

  useEffect(() => {
    return onBilling((e) => {
      if (e.code === 'READ_ONLY') router.push('/assinatura');
      else setModal({ code: e.code, feature: e.feature });
    });
  }, [router]);

  const isReadOnly = data?.entitlements.isReadOnly;
  const showTrial = data && !isReadOnly && data.status === 'TRIALING' && data.trialEndsAt;

  return (
    <>
      {isReadOnly && (
        <div role="alert" className="bg-destructive/10 text-destructive px-4 py-2 text-sm text-center">
          Sua conta está em <strong>somente leitura</strong>. <a href="/assinatura" className="underline font-medium">Assine</a> para voltar a editar.
        </div>
      )}
      {showTrial && (
        <div className="bg-primary/10 text-primary px-4 py-2 text-sm text-center">
          Seu teste termina em <strong>{daysUntil(data!.trialEndsAt!)} dia(s)</strong>. <a href="/assinatura" className="underline font-medium">Assinar</a>
        </div>
      )}
      {modal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-lg p-6 max-w-sm w-full space-y-4">
            <h2 className="text-lg font-semibold">{MODAL_COPY[modal.code].title}</h2>
            <p className="text-sm text-muted-foreground">{MODAL_COPY[modal.code].body}</p>
            <div className="flex justify-end gap-2">
              <button className="text-sm px-3 py-2" onClick={() => setModal(null)}>Fechar</button>
              <button className="text-sm px-3 py-2 rounded bg-primary text-primary-foreground" onClick={() => { setModal(null); router.push('/assinatura'); }}>Ver planos</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: Montar no layout**

Em `app/(app)/layout.tsx`, importar `BillingGate` e renderizá-lo logo dentro de `<SidebarInset>`, **antes** do `<header>`:

```tsx
import { BillingGate } from '@/components/billing/billing-gate';
// ...
      <SidebarInset>
        <BillingGate />
        <header ...>
```

- [ ] **Step 6: Rodar teste + tsc**

Run: `pnpm --filter @nutri-plus/web test billing-gate && pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: PASS + tsc limpo.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/billing/billing-events.ts apps/web/src/components/billing/billing-gate.tsx apps/web/src/app/providers.tsx apps/web/src/app/\(app\)/layout.tsx apps/web/src/components/billing/billing-gate.test.tsx
git commit -m "feat(web): BillingGate (banners trial/read-only + modais 402) no layout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Web — página de paywall (/assinatura) + checkout + confirmação

**Files:**
- Create: `apps/web/src/app/(app)/assinatura/page.tsx`
- Create: `apps/web/src/components/billing/plan-picker.tsx`
- Test: `apps/web/src/app/(app)/assinatura/page.test.tsx`

**Interfaces:**
- Consumes: `PLAN_CATALOG`, `PlanTier`, `BillingPeriod` (shared-types); `checkoutSubscription`; `getSubscription`, `SUBSCRIPTION_KEY`; `useQuery`.
- Produces: `AssinaturaPage`, `<PlanPicker/>`.

- [ ] **Step 1: PlanPicker (cards + toggle mensal/anual)**

```tsx
// apps/web/src/components/billing/plan-picker.tsx
'use client';
import { useState } from 'react';
import type { BillingPeriod, PlanTier } from '@nutri-plus/shared-types';
import { PLAN_CATALOG } from '@nutri-plus/shared-types';

const TIERS: PlanTier[] = ['ESSENCIAL', 'PRO'];
const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR')}`;

export function PlanPicker({ onChoose }: { onChoose: (plan: PlanTier, period: BillingPeriod) => void }) {
  const [period, setPeriod] = useState<BillingPeriod>('MONTHLY');
  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-2 text-sm">
        <button aria-pressed={period === 'MONTHLY'} onClick={() => setPeriod('MONTHLY')} className={period === 'MONTHLY' ? 'font-semibold underline' : ''}>Mensal</button>
        <button aria-pressed={period === 'YEARLY'} onClick={() => setPeriod('YEARLY')} className={period === 'YEARLY' ? 'font-semibold underline' : ''}>Anual <span className="text-primary">(2 meses grátis)</span></button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {TIERS.map((tier) => {
          const cfg = PLAN_CATALOG[tier];
          const price = period === 'MONTHLY' ? cfg.monthlyBrl : cfg.yearlyBrl;
          return (
            <div key={tier} className="rounded-lg border p-6 space-y-3">
              <h3 className="text-lg font-semibold">{tier === 'PRO' ? 'Pro' : 'Essencial'}</h3>
              <p className="text-2xl font-bold">{brl(price)}<span className="text-sm font-normal text-muted-foreground">/{period === 'MONTHLY' ? 'mês' : 'ano'}</span></p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>{cfg.aiActionsPerMonth} ações de IA/mês</li>
                <li>{cfg.features.includes('silhueta') ? '✓' : '—'} Silhueta</li>
                <li>{cfg.features.includes('transcription') ? '✓' : '—'} Transcrição</li>
                <li>{cfg.employeeSeats > 0 ? `Até ${cfg.employeeSeats} funcionários` : 'Sem funcionários'}</li>
              </ul>
              <button className="w-full rounded bg-primary text-primary-foreground py-2 text-sm" onClick={() => onChoose(tier, period)}>
                Assinar {tier === 'PRO' ? 'Pro' : 'Essencial'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Teste da página (falha primeiro)**

```tsx
// apps/web/src/app/(app)/assinatura/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const checkout = vi.fn();
vi.mock('@/lib/api/subscription', () => ({ checkoutSubscription: (b: any) => checkout(b), getSubscription: vi.fn() }));
const useQuery = vi.fn();
vi.mock('@tanstack/react-query', () => ({ useQuery: () => useQuery() }));

import AssinaturaPage from './page';

beforeEach(() => { checkout.mockReset(); useQuery.mockReturnValue({ data: { status: 'TRIALING', entitlements: { isReadOnly: false } } }); });

it('mostra os planos e faz checkout redirecionando ao invoiceUrl', async () => {
  checkout.mockResolvedValue({ invoiceUrl: 'https://asaas/inv/1' });
  const origin = { href: '' };
  vi.stubGlobal('location', origin as any);
  render(<AssinaturaPage />);
  fireEvent.click(screen.getAllByText(/Assinar/i)[0]);
  // preenche CPF e confirma
  fireEvent.change(screen.getByLabelText(/CPF/i), { target: { value: '123.456.789-01' } });
  fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
  await waitFor(() => expect(checkout).toHaveBeenCalledWith(expect.objectContaining({ plan: 'ESSENCIAL', period: 'MONTHLY', cpfCnpj: '12345678901' })));
  await waitFor(() => expect(origin.href).toBe('https://asaas/inv/1'));
});

it('mostra sucesso quando a assinatura está ativa', () => {
  useQuery.mockReturnValue({ data: { status: 'ACTIVE', entitlements: { isReadOnly: false } } });
  render(<AssinaturaPage />);
  expect(screen.getByText(/assinatura ativa/i)).toBeInTheDocument();
});
```

Run: `pnpm --filter @nutri-plus/web test assinatura`
Expected: FAIL.

- [ ] **Step 3: Implementar a página**

```tsx
// apps/web/src/app/(app)/assinatura/page.tsx
'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BillingPeriod, PlanTier } from '@nutri-plus/shared-types';
import { checkoutSubscription, getSubscription } from '@/lib/api/subscription';
import { PlanPicker } from '@/components/billing/plan-picker';

export default function AssinaturaPage() {
  // Poll enquanto pendente: após pagar no Asaas o webhook vira o status.
  const { data } = useQuery({ queryKey: ['subscription'], queryFn: getSubscription, refetchInterval: 5000 });
  const [choice, setChoice] = useState<{ plan: PlanTier; period: BillingPeriod } | null>(null);
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = data?.status === 'ACTIVE' && !data?.entitlements.isReadOnly;

  if (active) {
    return (
      <div className="max-w-md mx-auto text-center space-y-3 py-12">
        <h1 className="text-xl font-semibold">Assinatura ativa 🎉</h1>
        <p className="text-sm text-muted-foreground">Seu plano {data?.plan === 'PRO' ? 'Pro' : 'Essencial'} está ativo.</p>
        <a href="/" className="underline text-sm">Ir para o painel</a>
      </div>
    );
  }

  async function confirm() {
    if (!choice) return;
    const digits = cpfCnpj.replace(/\D/g, '');
    if (digits.length !== 11 && digits.length !== 14) { setError('Informe um CPF (11) ou CNPJ (14) válido.'); return; }
    setLoading(true); setError(null);
    try {
      const { invoiceUrl } = await checkoutSubscription({ plan: choice.plan, period: choice.period, cpfCnpj: digits });
      window.location.href = invoiceUrl; // página hospedada do Asaas (Pix/cartão)
    } catch {
      setError('Não foi possível iniciar o pagamento. Tente novamente.');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6">
      <h1 className="text-2xl font-semibold text-center">Escolha seu plano</h1>
      {!choice ? (
        <PlanPicker onChoose={(plan, period) => setChoice({ plan, period })} />
      ) : (
        <div className="max-w-sm mx-auto space-y-4 rounded-lg border p-6">
          <p className="text-sm">Plano <strong>{choice.plan === 'PRO' ? 'Pro' : 'Essencial'}</strong> — {choice.period === 'MONTHLY' ? 'mensal' : 'anual'}.</p>
          <label className="block text-sm">CPF/CNPJ
            <input aria-label="CPF/CNPJ" className="mt-1 w-full rounded border px-3 py-2" value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} placeholder="Somente números" />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-between">
            <button className="text-sm px-3 py-2" onClick={() => setChoice(null)}>Voltar</button>
            <button className="text-sm px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50" disabled={loading} onClick={confirm}>
              {loading ? 'Redirecionando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar teste + tsc**

Run: `pnpm --filter @nutri-plus/web test assinatura && pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: PASS + tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/assinatura apps/web/src/components/billing/plan-picker.tsx
git commit -m "feat(web): paywall /assinatura (planos + checkout Asaas + confirmação)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: Web — locks de recurso, chip de cota e aba Assinatura

**Files:**
- Create: `apps/web/src/components/billing/pro-gate.tsx` (`useFeature` + `<ProGate/>`)
- Create: `apps/web/src/components/billing/ai-quota-chip.tsx`
- Create: `apps/web/src/components/settings/subscription-tab.tsx`
- Modify: `apps/web/src/components/settings/settings-view.tsx` (nova aba "Assinatura")
- Modify: `apps/web/src/components/patients/patient-detail.tsx` (envolver os gatilhos de Silhueta e Transcrição com `<ProGate/>`)
- Modify: `apps/web/src/app/(app)/employees/*` (botão "Adicionar funcionário" com `<ProGate feature="employees">`)
- Test: `apps/web/src/components/billing/pro-gate.test.tsx`, `apps/web/src/components/settings/subscription-tab.test.tsx`

**Interfaces:**
- Consumes: `useSubscription`; `emitBilling`; `cancelSubscription`; `PLAN_CATALOG`.
- Produces: `useFeature(feature): boolean`, `<ProGate feature>…</ProGate>`, `<AiQuotaChip/>`, `<SubscriptionTab/>`.

- [ ] **Step 1: Teste do ProGate (falha primeiro)**

```tsx
// apps/web/src/components/billing/pro-gate.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const useSubscription = vi.fn();
vi.mock('@/lib/queries/subscription', () => ({ useSubscription: () => useSubscription() }));
const emit = vi.fn();
vi.mock('@/lib/billing/billing-events', () => ({ emitBilling: (...a: any[]) => emit(...a) }));

import { ProGate } from './pro-gate';

it('libera o conteúdo quando a feature está disponível', () => {
  useSubscription.mockReturnValue({ data: { entitlements: { features: { silhueta: true } } } });
  render(<ProGate feature="silhueta"><button>Silhueta</button></ProGate>);
  expect(screen.getByText('Silhueta')).toBeEnabled();
});

it('bloqueia (lock) e emite upsell no clique quando indisponível', () => {
  useSubscription.mockReturnValue({ data: { entitlements: { features: { silhueta: false } } } });
  render(<ProGate feature="silhueta"><button>Silhueta</button></ProGate>);
  fireEvent.click(screen.getByRole('button'));
  expect(emit).toHaveBeenCalledWith('FEATURE_PRO_ONLY', 'silhueta');
});
```

Run: `pnpm --filter @nutri-plus/web test pro-gate`
Expected: FAIL.

- [ ] **Step 2: Implementar ProGate + useFeature**

```tsx
// apps/web/src/components/billing/pro-gate.tsx
'use client';
import type { PlanFeature } from '@nutri-plus/shared-types';
import { Lock } from 'lucide-react';
import { useSubscription } from '@/lib/queries/subscription';
import { emitBilling } from '@/lib/billing/billing-events';

export function useFeature(feature: PlanFeature): boolean {
  const { data } = useSubscription();
  return data?.entitlements.features[feature] ?? false;
}

// Se a feature está liberada, renderiza os filhos. Senão, mostra um botão com
// cadeado que abre o upsell (reaproveita o modal do BillingGate via emitBilling).
export function ProGate({ feature, children, label }: { feature: PlanFeature; children: React.ReactNode; label?: string }) {
  const allowed = useFeature(feature);
  if (allowed) return <>{children}</>;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded border px-3 py-2 text-sm text-muted-foreground"
      onClick={() => emitBilling('FEATURE_PRO_ONLY', feature)}
    >
      <Lock className="h-4 w-4" /> {label ?? 'Recurso Pro'}
    </button>
  );
}
```

*(`lucide-react` já é dep do web — usado em ícones existentes.)*

- [ ] **Step 3: AiQuotaChip**

```tsx
// apps/web/src/components/billing/ai-quota-chip.tsx
'use client';
import { useSubscription } from '@/lib/queries/subscription';

export function AiQuotaChip() {
  const { data } = useSubscription();
  if (!data) return null;
  const { aiUsed, aiQuota } = data.entitlements;
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      IA: {aiUsed}/{aiQuota} este mês
    </span>
  );
}
```

- [ ] **Step 4: Aplicar os locks + chip**

- `patient-detail.tsx`: envolver o botão que abre a **Silhueta** com `<ProGate feature="silhueta" label="Silhueta (Pro)">…</ProGate>` e o botão **Transcrever** com `<ProGate feature="transcription" label="Transcrever (Pro)">…</ProGate>`. Colocar `<AiQuotaChip />` no cabeçalho da seção de planos alimentares.
- Página de **employees** (o botão "Adicionar funcionário"): envolver com `<ProGate feature="employees" label="Funcionários (Pro)">…</ProGate>`.

- [ ] **Step 5: Teste da aba Assinatura (falha primeiro)**

```tsx
// apps/web/src/components/settings/subscription-tab.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const useSubscription = vi.fn();
vi.mock('@/lib/queries/subscription', () => ({ useSubscription: () => useSubscription() }));
const cancel = vi.fn();
vi.mock('@/lib/api/subscription', () => ({ cancelSubscription: () => cancel() }));

import { SubscriptionTab } from './subscription-tab';

it('mostra o plano atual e cancela ao confirmar', async () => {
  cancel.mockResolvedValue({ ok: true });
  vi.stubGlobal('confirm', () => true);
  useSubscription.mockReturnValue({ data: { status: 'ACTIVE', plan: 'PRO', billingPeriod: 'MONTHLY', currentPeriodEnd: '2026-09-01T00:00:00.000Z', cancelAtPeriodEnd: false, recentPayments: [], entitlements: { isReadOnly: false } }, refetch: vi.fn() });
  render(<SubscriptionTab />);
  expect(screen.getByText(/Pro/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
  await waitFor(() => expect(cancel).toHaveBeenCalled());
});
```

Run: `pnpm --filter @nutri-plus/web test subscription-tab`
Expected: FAIL.

- [ ] **Step 6: Implementar a SubscriptionTab**

```tsx
// apps/web/src/components/settings/subscription-tab.tsx
'use client';
import { useSubscription } from '@/lib/queries/subscription';
import { cancelSubscription } from '@/lib/api/subscription';

const STATUS_LABEL: Record<string, string> = {
  TRIALING: 'Em teste', ACTIVE: 'Ativa', PAST_DUE: 'Pagamento pendente', CANCELED: 'Cancelada',
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

export function SubscriptionTab() {
  const { data, refetch } = useSubscription();
  if (!data) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  async function onCancel() {
    if (!confirm('Cancelar a assinatura? Você mantém o acesso até o fim do período pago.')) return;
    await cancelSubscription();
    await refetch?.();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-sm">
        <p>Plano: <strong>{data.plan === 'PRO' ? 'Pro' : data.plan === 'ESSENCIAL' ? 'Essencial' : '—'}</strong> {data.billingPeriod ? `(${data.billingPeriod === 'MONTHLY' ? 'mensal' : 'anual'})` : ''}</p>
        <p>Status: <strong>{STATUS_LABEL[data.status] ?? data.status}</strong>{data.isComp ? ' (cortesia)' : ''}</p>
        <p>Próxima cobrança: {fmt(data.currentPeriodEnd)}{data.cancelAtPeriodEnd ? ' (cancelamento agendado)' : ''}</p>
      </div>

      <div className="flex gap-2">
        <a href="/assinatura" className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm">Trocar plano</a>
        {(data.status === 'ACTIVE' || data.status === 'PAST_DUE') && !data.cancelAtPeriodEnd && (
          <button className="rounded border px-4 py-2 text-sm" onClick={onCancel}>Cancelar assinatura</button>
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2">Faturas</h4>
        {data.recentPayments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma fatura ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th>Vencimento</th><th>Valor</th><th>Status</th><th>Método</th></tr></thead>
            <tbody>
              {data.recentPayments.map((p) => (
                <tr key={p.id} className="border-t">
                  <td>{fmt(p.dueDate)}</td><td>R$ {p.amount.toLocaleString('pt-BR')}</td><td>{p.status}</td><td>{p.billingType ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Adicionar a aba no settings-view**

Em `settings-view.tsx`, adicionar um `TabsTrigger value="assinatura">Assinatura</TabsTrigger>` (espelhando as abas existentes) e um `<TabsContent value="assinatura"><SubscriptionTab /></TabsContent>` (import de `./subscription-tab`).

- [ ] **Step 8: Rodar testes + tsc**

Run: `pnpm --filter @nutri-plus/web test pro-gate subscription-tab && pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: PASS + tsc limpo.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/billing/pro-gate.tsx apps/web/src/components/billing/ai-quota-chip.tsx apps/web/src/components/settings/subscription-tab.tsx apps/web/src/components/settings/settings-view.tsx apps/web/src/components/patients/patient-detail.tsx apps/web/src/app/\(app\)/employees apps/web/src/components/billing/pro-gate.test.tsx apps/web/src/components/settings/subscription-tab.test.tsx
git commit -m "feat(web): locks de recurso Pro, chip de cota e aba Assinatura

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificação final (após todas as tarefas)

- [ ] shared-types: `pnpm --filter @nutri-plus/shared-types build` — limpo.
- [ ] API: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit` — verde.
- [ ] Web: `pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit` — verde.
- [ ] Mobile (não deve ripar): `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` — limpo (nenhum arquivo mobile tocado).
- [ ] Deploy: setar `ASAAS_API_KEY`, `ASAAS_API_URL`, `ASAAS_WEBHOOK_TOKEN` no Render (`sync:false`); registrar a URL do webhook (`/v1/internal/asaas/webhook`) + o token no painel do Asaas; rodar o script de cortesia uma vez com `COMP_NUTRITIONIST_EMAILS="paulo@empathmsp.com" pnpm --filter @nutri-plus/api run seed:subscriptions`.

## Notas de escopo / decisões travadas

- **Cota de IA** conta só `MEAL_PLAN_GENERATION` + `MEAL_PLAN_ADJUSTMENT` (nutricionista); **fora-de-casa não conta** (paciente, app grátis) — só carimba `nutritionistId`.
- **Trial** = acesso nível-Pro; **expiração** = somente-leitura (GET passa, escrita 402 `READ_ONLY`).
- **Troca de plano** encerra a assinatura Asaas anterior antes de criar a nova (evita cobrança dupla).
- **Mobile/paciente intocados.** Nenhum arquivo em `apps/mobile`.

