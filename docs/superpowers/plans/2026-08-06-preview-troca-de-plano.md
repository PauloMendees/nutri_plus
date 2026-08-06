# Preview de Valor na Troca de Plano — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Antes de cobrar uma troca de plano, mostrar ao assinante ativo — de forma autoritativa (calculada no server) — quanto ele paga agora e o valor recorrente, com um passo de confirmação.

**Architecture:** Extrair a decisão/proração do `changePlan` para um helper privado `computeChange(sub, dto)` (a única fonte da matemática de dinheiro). Um novo método `previewChangePlan` reusa esse helper sem tocar no Asaas nem no banco, exposto por `POST /v1/me/subscription/change-plan/preview`. No web, escolher um plano passa a chamar o preview e renderizar um painel de confirmação; **Confirmar** chama o `changePlan` já existente (todo o pós-processamento — Pix QR / sucesso do cartão / agendado — permanece inalterado).

**Tech Stack:** NestJS 10 + Prisma 7 (jest) na API; Next.js 16 App Router + react-query + shadcn/ui (vitest) no web; `@nutri-plus/shared-types` (pacote TS compilado para `dist/`).

## Global Constraints

- **Sem dependência nova.** Nenhum pacote adicionado a nenhum `package.json`.
- **pt-BR** em todo texto de UI.
- **Dinheiro é autoritativo no server:** o preview e a cobrança usam o **mesmo** `computeChange`. Nenhuma fórmula de proração no frontend.
- O preview **não** faz efeito colateral: não chama `asaas.*` nem `prisma.subscription.update`.
- `previewChangePlan` só para `status === 'ACTIVE'` (mesma guarda de `changePlan`); senão `UnprocessableEntityException({ code: 'NOT_ACTIVE' })`.
- `changePlan` deve manter **comportamento idêntico** após o refactor — todos os testes existentes de `changePlan` continuam verdes sem edição.
- Self-serve: rotas sob `@Roles(NUTRITIONIST)` + `@BillingExempt`. Paciente/mobile **inalterados**.
- Mesma branch `feat/assinatura-pagamentos` (mesmo PR #54). **Não** abrir novo PR.
- Trailer de commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Verificação por área: `shared-types` build; API `tsc --noEmit` + jest; web `tsc --noEmit` + vitest.

---

### Task 1: shared-types `ChangePlanPreview` + server (`computeChange` / `previewChangePlan` / endpoint)

**Files:**
- Modify: `packages/shared-types/src/v1/billing.ts` (add `ChangePlanPreview` interface — after `ChangePlanResponse`, ~line 47)
- Modify: `apps/api/src/billing/subscription.service.ts` (add `ChangeComputation` + `computeChange`; refactor `changePlan`; add `previewChangePlan`; import `ChangePlanPreview`)
- Modify: `apps/api/src/billing/me-subscription.controller.ts` (add `POST change-plan/preview` route; import `ChangePlanPreview`)
- Test: `apps/api/src/billing/subscription.service.spec.ts` (add `describe('SubscriptionService.previewChangePlan')`)

**Interfaces:**
- Consumes: `PLAN_CATALOG`, `ChangePlanRequest`, `BillingPeriod`, `PlanTier` from `@nutri-plus/shared-types`; module-local `TIER_RANK`, `planValue(plan, period)`.
- Produces:
  - `interface ChangePlanPreview { kind: 'UPGRADE' | 'SCHEDULED'; amountNow: number; recurringValue: number; recurringPeriod: BillingPeriod; effectiveDate: string /* ISO */ }` (shared-types)
  - `SubscriptionService.previewChangePlan(nutritionistId: string, dto: ChangePlanRequest): Promise<ChangePlanPreview>`
  - Endpoint `POST /v1/me/subscription/change-plan/preview` (body = `ChangePlanDto` = `{ plan, period }`) → `ChangePlanPreview`
  - Private `computeChange(sub: { plan: 'ESSENCIAL' | 'PRO'; billingPeriod: 'MONTHLY' | 'YEARLY'; currentPeriodEnd: Date }, dto: ChangePlanRequest): ChangeComputation` where `ChangeComputation = { kind: 'UPGRADE' | 'SCHEDULED'; amountNow: number; recurringValue: number; recurringPeriod: 'MONTHLY' | 'YEARLY'; effectiveDate: Date }`

- [ ] **Step 1: Add the `ChangePlanPreview` shared type**

In `packages/shared-types/src/v1/billing.ts`, immediately after the `ChangePlanResponse` union (ends ~line 47), add:

```ts
export interface ChangePlanPreview {
  kind: 'UPGRADE' | 'SCHEDULED';
  amountNow: number; // 0 no agendado; diferença pro-rata no upgrade
  recurringValue: number; // valor do plano novo por ciclo
  recurringPeriod: BillingPeriod;
  effectiveDate: string; // ISO — vencimento (upgrade) / quando passa a valer (agendado)
}
```

(`BillingPeriod` já é declarado no topo do arquivo — nenhum import novo.)

- [ ] **Step 2: Build shared-types so API/web enxergam o tipo novo**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: PASS (compila `dist/`). `ChangePlanPreview` passa a ser exportado por `@nutri-plus/shared-types` via `export * from './billing'`.

- [ ] **Step 3: Write the failing service tests for `previewChangePlan`**

Append to `apps/api/src/billing/subscription.service.spec.ts` (o helper `activeSub(...)` já existe no arquivo, ~linha 113, e é reutilizável):

```ts
describe('SubscriptionService.previewChangePlan', () => {
  it('preview de upgrade (mesmo período, tier↑) retorna amountNow>0 e recurringValue novo, sem efeito colateral', async () => {
    const { svc, prisma, asaas } = deps(activeSub()); // ESSENCIAL/MONTHLY, 15 dias restantes
    asaas.createOneOffCharge = jest.fn();
    asaas.updateSubscriptionValue = jest.fn();
    const out = await svc.previewChangePlan('n1', { plan: 'PRO', period: 'MONTHLY' });
    expect(out.kind).toBe('UPGRADE');
    expect(out.amountNow).toBeGreaterThan(0);
    expect(out.recurringValue).toBe(99);
    expect(out.recurringPeriod).toBe('MONTHLY');
    expect(typeof out.effectiveDate).toBe('string');
    // Sem efeito colateral: nada de Asaas nem gravação.
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(asaas.createOneOffCharge).not.toHaveBeenCalled();
    expect(asaas.updateSubscriptionValue).not.toHaveBeenCalled();
  });

  it('preview de downgrade/troca de período retorna SCHEDULED e amountNow 0, sem efeito colateral', async () => {
    const { svc, prisma, asaas } = deps(activeSub({ plan: 'PRO' }));
    asaas.updateSubscriptionValue = jest.fn();
    const out = await svc.previewChangePlan('n1', { plan: 'ESSENCIAL', period: 'MONTHLY' });
    expect(out.kind).toBe('SCHEDULED');
    expect(out.amountNow).toBe(0);
    expect(out.recurringValue).toBe(49);
    expect(out.recurringPeriod).toBe('MONTHLY');
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(asaas.updateSubscriptionValue).not.toHaveBeenCalled();
  });

  it('preview rejeita quando não está ACTIVE', async () => {
    const { svc } = deps({ id: 's1', nutritionistId: 'n1', status: 'TRIALING' });
    await expect(svc.previewChangePlan('n1', { plan: 'PRO', period: 'MONTHLY' })).rejects.toBeDefined();
  });
});
```

- [ ] **Step 4: Run the new tests to verify they fail**

Run: `pnpm --filter @nutri-plus/api test -- subscription.service`
Expected: FAIL — `svc.previewChangePlan is not a function` (método ainda não existe).

- [ ] **Step 5: Add `ChangeComputation` + `computeChange`, refactor `changePlan`, add `previewChangePlan`**

In `apps/api/src/billing/subscription.service.ts`:

**(5a)** Add `ChangePlanPreview` to the shared-types import (linhas 2–10):

```ts
import type {
  ChangePlanPreview,
  ChangePlanRequest,
  ChangePlanResponse,
  CheckoutRequest,
  CheckoutResponse,
  PaymentMethod,
  PaymentMethodRequest,
  SubscriptionView,
} from '@nutri-plus/shared-types';
```

**(5b)** Add the `ChangeComputation` interface right after `planValue(...)` (após ~linha 29, junto dos helpers de módulo):

```ts
interface ChangeComputation {
  kind: 'UPGRADE' | 'SCHEDULED';
  amountNow: number; // diferença pro-rata (upgrade) ou 0 (agendado)
  recurringValue: number; // valor do plano novo por ciclo
  recurringPeriod: 'MONTHLY' | 'YEARLY';
  effectiveDate: Date; // vencimento mantido (upgrade) / quando passa a valer (agendado)
}
```

**(5c)** Add the private `computeChange` method inside the class (pode ficar logo antes de `changePlan`). É a extração literal da matemática que já existia inline:

```ts
private computeChange(
  sub: { plan: 'ESSENCIAL' | 'PRO'; billingPeriod: 'MONTHLY' | 'YEARLY'; currentPeriodEnd: Date },
  dto: ChangePlanRequest,
): ChangeComputation {
  const currentTier = sub.plan;
  const currentPeriod = sub.billingPeriod;
  const newValue = planValue(dto.plan, dto.period);
  const isUpgrade = dto.period === currentPeriod && TIER_RANK[dto.plan] > TIER_RANK[currentTier];

  if (isUpgrade) {
    const cur = planValue(currentTier, currentPeriod);
    const cycleDays = currentPeriod === 'YEARLY' ? 365 : 30;
    const remainingDays = Math.max(0, Math.ceil((sub.currentPeriodEnd.getTime() - Date.now()) / 86400000));
    const diff = Math.round((newValue - cur) * remainingDays / cycleDays * 100) / 100;
    return { kind: 'UPGRADE', amountNow: diff, recurringValue: newValue, recurringPeriod: dto.period, effectiveDate: sub.currentPeriodEnd };
  }
  return { kind: 'SCHEDULED', amountNow: 0, recurringValue: newValue, recurringPeriod: dto.period, effectiveDate: sub.currentPeriodEnd };
}
```

**(5d)** Replace the body of `changePlan` (linhas 146–197) so it consumes `computeChange` — **mesma lógica, mesmos retornos, só compartilhando a matemática**:

```ts
async changePlan(nutritionistId: string, dto: ChangePlanRequest): Promise<ChangePlanResponse> {
  const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
  if (!sub || sub.status !== 'ACTIVE' || !sub.asaasSubscriptionId || !sub.asaasCustomerId || !sub.plan || !sub.billingPeriod || !sub.currentPeriodEnd) {
    throw new UnprocessableEntityException({ code: 'NOT_ACTIVE', message: 'Troca de plano só está disponível para uma assinatura ativa.' });
  }
  const change = this.computeChange(
    { plan: sub.plan as 'ESSENCIAL' | 'PRO', billingPeriod: sub.billingPeriod as 'MONTHLY' | 'YEARLY', currentPeriodEnd: sub.currentPeriodEnd },
    dto,
  );
  const newValue = change.recurringValue;

  if (change.kind === 'UPGRADE') {
    const diff = change.amountNow;

    if (sub.paymentMethod === 'CREDIT_CARD') {
      if (!sub.asaasCardToken) {
        throw new UnprocessableEntityException({ code: 'CARD_TOKEN_MISSING', message: 'Atualize seu cartão em Configurações antes de fazer o upgrade.' });
      }
      const charge = await this.asaas.createOneOffCharge({ customerId: sub.asaasCustomerId, value: diff, billingType: 'CREDIT_CARD', creditCardToken: sub.asaasCardToken, description: `Upgrade nutri_plus ${dto.plan}` });
      if (charge.status === 'ACTIVE') {
        // cobrança confirmada na hora → aplica o upgrade já
        await this.asaas.updateSubscriptionValue(sub.asaasSubscriptionId, { value: newValue });
        await this.prisma.subscription.update({
          where: { nutritionistId },
          data: { plan: dto.plan, billingPeriod: dto.period, pendingPlan: null, pendingBillingPeriod: null, pendingChargeAsaasId: null },
        });
        await this.upsertPayment(sub.id, { id: charge.paymentId, value: diff, status: 'CONFIRMED', billingType: 'CREDIT_CARD', paymentDate: new Date().toISOString() });
        return { kind: 'UPGRADE', method: 'CREDIT_CARD', status: 'ACTIVE', amount: diff };
      }
      // PENDING (ex.: análise antifraude) → não muda o plano ainda; o webhook aplica quando confirmar.
      await this.prisma.subscription.update({ where: { nutritionistId }, data: { pendingPlan: dto.plan, pendingBillingPeriod: dto.period, pendingChargeAsaasId: charge.paymentId } });
      return { kind: 'UPGRADE', method: 'CREDIT_CARD', status: 'PENDING', amount: diff };
    }
    // PIX
    const charge = await this.asaas.createOneOffCharge({ customerId: sub.asaasCustomerId, value: diff, billingType: 'PIX', description: `Upgrade nutri_plus ${dto.plan}` });
    await this.prisma.subscription.update({ where: { nutritionistId }, data: { pendingPlan: dto.plan, pendingBillingPeriod: dto.period, pendingChargeAsaasId: charge.paymentId } });
    return { kind: 'UPGRADE', method: 'PIX', pixQrCode: charge.pixQrCode!, amount: diff };
  }

  // downgrade ou troca de período → agenda
  await this.asaas.updateSubscriptionValue(sub.asaasSubscriptionId, { value: newValue, cycle: dto.period });
  // Limpa pendingChargeAsaasId: um upgrade Pix/cartão abandonado anteriormente não pode
  // sobreviver aqui, senão o guard do webhook (`pendingPlan && !pendingChargeAsaasId`) nunca
  // fecha e esse agendamento nunca promove no próximo ciclo.
  await this.prisma.subscription.update({
    where: { nutritionistId },
    data: { pendingPlan: dto.plan, pendingBillingPeriod: dto.period, pendingChargeAsaasId: null },
  });
  return { kind: 'SCHEDULED', effectiveDate: sub.currentPeriodEnd.toISOString() };
}
```

**(5e)** Add `previewChangePlan` right after `changePlan` (mesma guarda, sem efeitos colaterais):

```ts
async previewChangePlan(nutritionistId: string, dto: ChangePlanRequest): Promise<ChangePlanPreview> {
  const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
  if (!sub || sub.status !== 'ACTIVE' || !sub.asaasSubscriptionId || !sub.asaasCustomerId || !sub.plan || !sub.billingPeriod || !sub.currentPeriodEnd) {
    throw new UnprocessableEntityException({ code: 'NOT_ACTIVE', message: 'Troca de plano só está disponível para uma assinatura ativa.' });
  }
  const change = this.computeChange(
    { plan: sub.plan as 'ESSENCIAL' | 'PRO', billingPeriod: sub.billingPeriod as 'MONTHLY' | 'YEARLY', currentPeriodEnd: sub.currentPeriodEnd },
    dto,
  );
  return {
    kind: change.kind,
    amountNow: change.amountNow,
    recurringValue: change.recurringValue,
    recurringPeriod: change.recurringPeriod,
    effectiveDate: change.effectiveDate.toISOString(),
  };
}
```

> **Nota de design (guarda duplicada é intencional):** a guarda `if (!sub || sub.status !== 'ACTIVE' || ...)` é repetida em `changePlan` e `previewChangePlan` de propósito — ela dá o *control-flow narrowing* do TypeScript (os campos viram não-nulos no restante de cada método). Extraí-la para um método separado perderia esse narrowing e forçaria `!` em vários acessos. A duplicação real de lógica de dinheiro está eliminada por `computeChange`.

- [ ] **Step 6: Run the service tests to verify they pass (novos + existentes)**

Run: `pnpm --filter @nutri-plus/api test -- subscription.service`
Expected: PASS — os 3 testes novos de `previewChangePlan` passam **e** todos os testes de `changePlan`/`checkout`/etc. continuam verdes (comportamento inalterado).

- [ ] **Step 7: Add the preview endpoint to the controller**

In `apps/api/src/billing/me-subscription.controller.ts`:

Add `ChangePlanPreview` to the type import (linha 3):

```ts
import type { ChangePlanPreview, ChangePlanResponse, CheckoutResponse, SubscriptionView } from '@nutri-plus/shared-types';
```

Add the route right after `changePlan` (~linha 54, dentro da classe):

```ts
@Post('change-plan/preview')
previewChangePlan(@CurrentUser() ctx: AuthContext, @Body() dto: ChangePlanDto): Promise<ChangePlanPreview> {
  return this.subscription.previewChangePlan(resolveScopeNutritionistId(ctx), dto);
}
```

(`ChangePlanDto` já é importado e valida `{ plan, period }`; `change-plan` e `change-plan/preview` são paths estáticos distintos — ordem não importa.)

- [ ] **Step 8: Typecheck + full API test suite**

Run: `pnpm --filter @nutri-plus/api exec tsc --noEmit -p tsconfig.json`
Expected: PASS (0 erros).

Run: `pnpm --filter @nutri-plus/api test`
Expected: PASS (suite inteira verde).

- [ ] **Step 9: Commit**

```bash
git add packages/shared-types/src/v1/billing.ts \
  apps/api/src/billing/subscription.service.ts \
  apps/api/src/billing/me-subscription.controller.ts \
  apps/api/src/billing/subscription.service.spec.ts
git commit -m "feat(billing): preview de troca de plano no server (computeChange + previewChangePlan + endpoint)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> `packages/shared-types/dist` é git-ignored (build artifact) — **não** incluir no commit; apenas o fonte `billing.ts`.

---

### Task 2: Web — cliente `previewChangePlan` + passo de confirmação

**Files:**
- Modify: `apps/web/src/lib/api/subscription.ts` (add `previewChangePlan`; import `ChangePlanPreview`)
- Test: `apps/web/src/lib/api/subscription.test.ts` (add `previewChangePlan` test)
- Modify: `apps/web/src/app/(checkout)/assinatura/page.tsx` (state + handlers + painel de confirmação no ramo do assinante ativo)
- Test: `apps/web/src/app/(checkout)/assinatura/page.test.tsx` (mock `previewChangePlan`; atualizar o teste de upgrade; adicionar testes do fluxo)

**Interfaces:**
- Consumes: `previewChangePlan(nutritionistId, dto)` endpoint de Task 1; `ChangePlanPreview` de `@nutri-plus/shared-types`; `changePlan`, `PlanPicker` (prop `busy`, `onChoose`, `currentPlan`, `currentPeriod`), `PixPayment` — todos já existentes.
- Produces: `previewChangePlan(body: ChangePlanRequest): Promise<ChangePlanPreview>` no client; painel de confirmação de troca na página.

- [ ] **Step 1: Write the failing client test**

In `apps/web/src/lib/api/subscription.test.ts`, add `previewChangePlan` to the import and a test:

```ts
import { startTrial, updatePaymentMethod, checkoutSubscription, previewChangePlan } from './subscription';
```

```ts
it('previewChangePlan → POST /me/subscription/change-plan/preview', async () => {
  await previewChangePlan({ plan: 'PRO', period: 'MONTHLY' });
  expect(fetchMock).toHaveBeenCalledWith('/me/subscription/change-plan/preview', { method: 'POST', body: { plan: 'PRO', period: 'MONTHLY' } });
});
```

- [ ] **Step 2: Run the client test to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- src/lib/api/subscription.test.ts`
Expected: FAIL — `previewChangePlan` não é exportado.

- [ ] **Step 3: Implement the client function**

In `apps/web/src/lib/api/subscription.ts`, add `ChangePlanPreview` to the import block (linhas 1–8) and the function (após `changePlan`, ~linha 21):

```ts
import type {
  ChangePlanPreview,
  ChangePlanRequest,
  ChangePlanResponse,
  CheckoutRequest,
  CheckoutResponse,
  PaymentMethodRequest,
  SubscriptionView,
} from '@nutri-plus/shared-types';
```

```ts
export function previewChangePlan(body: ChangePlanRequest): Promise<ChangePlanPreview> {
  return browserApiFetch<ChangePlanPreview>('/me/subscription/change-plan/preview', { method: 'POST', body });
}
```

- [ ] **Step 4: Run the client test to verify it passes**

Run: `pnpm --filter @nutri-plus/web test -- src/lib/api/subscription.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the page test — mock + fluxo preview→confirmar; adicionar testes do fluxo**

In `apps/web/src/app/(checkout)/assinatura/page.test.tsx`:

**(5a)** Add the `previewChangePlan` spy + mock e reset:

```ts
const startTrial = vi.fn();
const checkout = vi.fn();
const changePlan = vi.fn();
const previewChangePlan = vi.fn();
vi.mock('@/lib/api/subscription', () => ({
  startTrial: () => startTrial(),
  checkoutSubscription: (b: any) => checkout(b),
  changePlan: (b: any) => changePlan(b),
  previewChangePlan: (b: any) => previewChangePlan(b),
  getSubscription: vi.fn(),
}));
```

No `beforeEach`, adicione o reset:

```ts
previewChangePlan.mockReset();
```

**(5b)** Replace the existing test `'upgrade no cartão chama changePlan e mostra sucesso'` (agora o clique no plano abre o preview; confirmar chama `changePlan`):

```ts
it('upgrade no cartão: escolher plano mostra o preview; confirmar chama changePlan e mostra sucesso', async () => {
  previewChangePlan.mockResolvedValue({ kind: 'UPGRADE', amountNow: 25, recurringValue: 99, recurringPeriod: 'MONTHLY', effectiveDate: '2026-08-20T00:00:00Z' });
  changePlan.mockResolvedValue({ kind: 'UPGRADE', method: 'CREDIT_CARD', status: 'ACTIVE', amount: 25 });
  useQuery.mockReturnValue({
    data: {
      status: 'ACTIVE',
      plan: 'ESSENCIAL',
      billingPeriod: 'MONTHLY',
      paymentMethod: 'CREDIT_CARD',
      onboardedAt: '2026-08-01T00:00:00Z',
      entitlements: { isReadOnly: false },
    },
  });
  render(<AssinaturaPage />);
  fireEvent.click(screen.getByRole('button', { name: /trocar para pro/i }));
  await waitFor(() => expect(previewChangePlan).toHaveBeenCalledWith({ plan: 'PRO', period: 'MONTHLY' }));
  // painel de confirmação com os valores
  await waitFor(() => expect(screen.getByText(/agora/i)).toBeInTheDocument());
  expect(screen.getByText(/99/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /confirmar troca/i }));
  await waitFor(() => expect(changePlan).toHaveBeenCalledWith({ plan: 'PRO', period: 'MONTHLY' }));
  await waitFor(() => expect(screen.getByText(/upgrade|pagou|plano alterado/i)).toBeInTheDocument());
});
```

**(5c)** Add a test for the SCHEDULED preview + Voltar:

```ts
it('preview agendado mostra "sem cobrança agora"; Voltar retorna ao picker sem chamar changePlan', async () => {
  previewChangePlan.mockResolvedValue({ kind: 'SCHEDULED', amountNow: 0, recurringValue: 49, recurringPeriod: 'MONTHLY', effectiveDate: '2026-09-01T00:00:00Z' });
  useQuery.mockReturnValue({
    data: {
      status: 'ACTIVE',
      plan: 'PRO',
      billingPeriod: 'MONTHLY',
      paymentMethod: 'CREDIT_CARD',
      onboardedAt: '2026-08-01T00:00:00Z',
      entitlements: { isReadOnly: false },
    },
  });
  render(<AssinaturaPage />);
  fireEvent.click(screen.getByRole('button', { name: /trocar para essencial/i }));
  await waitFor(() => expect(screen.getByText(/sem cobrança agora/i)).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /trocar para essencial/i })).toBeInTheDocument());
  expect(changePlan).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run the page tests to verify they fail**

Run: `pnpm --filter @nutri-plus/web test -- 'src/app/(checkout)/assinatura/page.test.tsx'`
Expected: FAIL — a página ainda chama `changePlan` direto (não há painel de confirmação, nem botão "Confirmar troca").

- [ ] **Step 7: Implement the confirmation step in the page**

In `apps/web/src/app/(checkout)/assinatura/page.tsx`:

**(7a)** Add `ChangePlanPreview` ao import de tipos (linha 5) e `previewChangePlan` ao import de API (linha 7):

```ts
import type { BillingPeriod, CardHolderInfo, CardInput, ChangePlanPreview, PixQrCode, PlanTier } from '@nutri-plus/shared-types';
import { ApiError } from '@/lib/api/client';
import { changePlan, checkoutSubscription, getSubscription, previewChangePlan, startTrial } from '@/lib/api/subscription';
```

**(7b)** Add a money formatter perto do topo do componente (após os `const` de mensagem, ~linha 18):

```ts
const moneyBrl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const periodLabel = (p: BillingPeriod) => (p === 'MONTHLY' ? 'mês' : 'ano');
```

**(7c)** Add state para o passo de confirmação (junto dos outros `useState`, após `changePix`, ~linha 34):

```ts
const [changeChoice, setChangeChoice] = useState<Choice | null>(null);
const [changePreview, setChangePreview] = useState<ChangePlanPreview | null>(null);
```

**(7d)** Add os handlers do preview (podem ficar logo antes de `onChangePlan`, ~linha 119). `onChangePlan` **permanece exatamente como está** — é chamado pelo Confirmar:

```ts
async function onPickChange(plan: PlanTier, period: BillingPeriod) {
  setLoading(true);
  setError(null);
  try {
    const preview = await previewChangePlan({ plan, period });
    setChangeChoice({ plan, period });
    setChangePreview(preview);
  } catch (err) {
    if (err instanceof ApiError && err.status === 422) {
      const body = err.body as { message?: string } | null;
      setError(body?.message ?? 'Não foi possível calcular a troca de plano.');
    } else {
      setError('Não foi possível calcular a troca de plano. Tente novamente.');
    }
  } finally {
    setLoading(false);
  }
}

function backToPicker() {
  setChangePreview(null);
  setChangeChoice(null);
  setError(null);
}

async function confirmChange() {
  if (!changeChoice) return;
  await onChangePlan(changeChoice.plan, changeChoice.period);
  setChangePreview(null);
  setChangeChoice(null);
}
```

**(7e)** Replace the active-subscriber render branch (o bloco `{isActive ? (...) : ...}`, linhas 159–175) para inserir o painel de confirmação entre o Pix e o picker, e apontar o picker para `onPickChange`:

```tsx
{isActive ? (
  <div className="space-y-6">
    {error && <p className="text-center text-sm text-destructive">{error}</p>}
    {changePix ? (
      <div className="mx-auto max-w-sm space-y-4 rounded-lg border p-6 text-center">
        <p className="text-sm text-muted-foreground">Pague a diferença para concluir o upgrade.</p>
        <PixPayment pixQrCode={changePix} />
      </div>
    ) : changePreview ? (
      <div className="mx-auto max-w-sm space-y-4 rounded-lg border p-6">
        {changePreview.kind === 'UPGRADE' ? (
          <p className="text-sm">
            Você paga <strong>R$ {moneyBrl(changePreview.amountNow)} agora</strong> (proporcional aos dias restantes) e depois{' '}
            <strong>R$ {moneyBrl(changePreview.recurringValue)}/{periodLabel(changePreview.recurringPeriod)}</strong>. Seu vencimento continua em{' '}
            <strong>{new Date(changePreview.effectiveDate).toLocaleDateString('pt-BR')}</strong>.
          </p>
        ) : (
          <p className="text-sm">
            Sem cobrança agora. A partir de <strong>{new Date(changePreview.effectiveDate).toLocaleDateString('pt-BR')}</strong> você paga{' '}
            <strong>R$ {moneyBrl(changePreview.recurringValue)}/{periodLabel(changePreview.recurringPeriod)}</strong>.
          </p>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={loading} onClick={confirmChange}>
            {loading ? 'Processando…' : 'Confirmar troca'}
          </Button>
          <Button variant="ghost" disabled={loading} onClick={backToPicker}>
            Voltar
          </Button>
        </div>
      </div>
    ) : (
      <PlanPicker
        currentPlan={data!.plan ?? undefined}
        currentPeriod={data!.billingPeriod ?? undefined}
        onChoose={onPickChange}
        busy={loading}
      />
    )}
  </div>
) : !choice ? (
```

- [ ] **Step 8: Run the page tests to verify they pass**

Run: `pnpm --filter @nutri-plus/web test -- 'src/app/(checkout)/assinatura/page.test.tsx'`
Expected: PASS — os 3 testes do ramo ativo (picker visível, upgrade via preview→confirmar, agendado + Voltar) verdes; os testes do ramo não-ativo (trial, Pix) intactos.

- [ ] **Step 9: Typecheck + full web test suite**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: PASS (0 erros).

Run: `pnpm --filter @nutri-plus/web test`
Expected: PASS (suite inteira verde).

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/api/subscription.ts \
  apps/web/src/lib/api/subscription.test.ts \
  'apps/web/src/app/(checkout)/assinatura/page.tsx' \
  'apps/web/src/app/(checkout)/assinatura/page.test.tsx'
git commit -m "feat(web): passo de confirmação com preview de valor na troca de plano

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução

- **Mobile inalterado.** Nenhum arquivo em `apps/mobile`. Rodar `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` ao final deve continuar limpo (a alteração é só em shared-types aditiva + web/api).
- **Verificação final por área** (antes do finishing): `pnpm --filter @nutri-plus/shared-types build`; `pnpm --filter @nutri-plus/api exec tsc --noEmit -p tsconfig.json` + `pnpm --filter @nutri-plus/api test`; `pnpm --filter @nutri-plus/web exec tsc --noEmit` + `pnpm --filter @nutri-plus/web test`.
- **Não** abrir novo PR — continuar em `feat/assinatura-pagamentos` / PR #54.
