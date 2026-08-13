# Ajustes de Assinatura + Upgrade com Proração Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polir o fluxo de assinatura (botões, faturas em PT, máscara de validade, dialogs de método) e permitir **troca de plano** com **upgrade prorateado** (mantém vencimento, cobra a diferença) + downgrade/período agendados.

**Architecture:** Os 4 ajustes de UI são mecânicos (usar `<Button>`, mapa de labels PT, máscara `MM/AAAA`, `Dialog`). A troca de plano vira um endpoint `change-plan`: upgrade cria uma **cobrança avulsa** no Asaas (cartão via token, síncrono; Pix via QR) e atualiza o `value` da subscription mantendo o `currentPeriodEnd`; downgrade/período agendam via `pendingPlan` promovido no próximo webhook. Fecha o I2 parqueado.

**Tech Stack:** NestJS 10 + Prisma 7 · Next.js 16 (App Router, react-query, shadcn/ui) · shared-types · Asaas REST v3 (fetch) · jest / vitest.

## Global Constraints

- Migração **aditiva**: `Subscription += pendingPlan PlanTier?`, `pendingBillingPeriod BillingPeriod?`, `pendingChargeAsaasId String?`, `asaasCardToken String?`. shared-types reconstruído.
- **Sem dependência nova** (Dialog do shadcn já existe em `components/ui/dialog`; QR via `<img>`). pt-BR em todo texto de UI.
- **PCI:** guardar só `cardLast4`/`cardBrand`/`asaasCardToken` (token), **nunca** o PAN; **nunca** logar cartão (o `AsaasService.call` não loga request body).
- **Proração só quando `status === ACTIVE`** (com `asaasSubscriptionId`+`plan`+`billingPeriod`+`currentPeriodEnd`). Trial/não-ativo usa o **checkout normal**. A troca de plano de um ativo **não** faz mais cancelar+recriar.
- **Regra upgrade vs agendado:** `mesmo período` **e** tier↑ (Essencial→Pro) → upgrade imediato pro-rata; senão (downgrade, ou troca de período) → agendado pro próximo ciclo.
- **`diff = round2((valorNovo − valorAtual) × diasRestantes / diasCiclo)`**; `diasCiclo = 30 (MONTHLY) | 365 (YEARLY)`; `diasRestantes = ceil((currentPeriodEnd − now)/dia)`. Valores do `PLAN_CATALOG`.
- Botões: usar `<Button>` (`@/components/ui/button`; base `rounded-lg`, variantes `default`/`outline`, `size="lg"` para CTAs grandes). Sem classes de radius ad-hoc nos componentes novos.
- Cliente pagante = `NutritionistProfile`; paciente/mobile **inalterados**. Self-serve `@Roles(NUTRITIONIST)` + `@BillingExempt`.
- Mesma branch `feat/assinatura-pagamentos` (mesmo PR #54). Aspas: api single quotes; web por arquivo. Testes API jest / web vitest. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** abrir novo PR. Verificar por área: shared-types build; API test+tsc; web test+tsc; mobile tsc (não deve ripar).

---

## File Structure

**Web**
- Modify `apps/web/src/components/billing/card-form.tsx` — máscara `MM/AAAA` + `<Button>`.
- Modify `apps/web/src/components/billing/plan-picker.tsx` — `<Button>` + props `currentPlan`/`currentPeriod` (destaca/desabilita o atual).
- Modify `apps/web/src/components/billing/pix-payment.tsx` — `<Button>` no copiar.
- Modify `apps/web/src/components/settings/subscription-tab.tsx` — labels PT de faturas + `<Button>` + `Dialog` (confirmação de troca de método + card-form modal).
- Modify `apps/web/src/app/(checkout)/assinatura/page.tsx` — sem auto-redirect p/ ativo; fluxo de troca de plano (upgrade pro-rata / agendado); `<Button>`.
- Modify `apps/web/src/lib/api/subscription.ts` — `changePlan(body)`.

**API**
- Modify `apps/api/prisma/schema.prisma` (+4 campos) + migração.
- Modify `apps/api/src/billing/asaas.service.ts` — `createOneOffCharge`, `updateSubscriptionValue`; `createCardSubscription`/`updateSubscriptionBilling` retornam `creditCardToken`.
- Modify `apps/api/src/billing/subscription.service.ts` — `changePlan`, webhook estendido, guarda `asaasCardToken` no checkout/updatePaymentMethod, helper `upsertPayment`/`applyUpgrade`.
- Create `apps/api/src/billing/dto/change-plan.dto.ts`.
- Modify `apps/api/src/billing/me-subscription.controller.ts` — rota `change-plan`.

**shared-types**
- Modify `packages/shared-types/src/v1/billing.ts` — `ChangePlanRequest`, `ChangePlanResponse`.

---

## Task 1: Web polish — máscara de validade + `<Button>` (card-form, plan-picker, pix-payment)

**Files:**
- Modify: `apps/web/src/components/billing/card-form.tsx`
- Modify: `apps/web/src/components/billing/plan-picker.tsx`
- Modify: `apps/web/src/components/billing/pix-payment.tsx`
- Test: `apps/web/src/components/billing/card-form.test.tsx` (estender)

**Interfaces:**
- Consumes: `Button` de `@/components/ui/button`.
- Produces: `CardForm` com input de validade mascarado; `PlanPicker` mantém a assinatura `{ onChoose }` (props novas vêm na Task 6).

- [ ] **Step 1: Teste da máscara (falha primeiro)**

Adicionar ao `card-form.test.tsx`:

```tsx
it('mascara a validade automaticamente (MM/AAAA) sem digitar a barra', () => {
  const onSubmit = vi.fn();
  render(<CardForm onSubmit={onSubmit} loading={false} error={null} />);
  const validade = screen.getByLabelText(/validade/i) as HTMLInputElement;
  fireEvent.change(validade, { target: { value: '122030' } });
  expect(validade.value).toBe('12/2030');
  // e o submit continua parseando certo:
  fireEvent.change(screen.getByLabelText(/número do cartão/i), { target: { value: '5162306219378829' } });
  fireEvent.change(screen.getByLabelText(/nome no cartão/i), { target: { value: 'Teste' } });
  fireEvent.change(screen.getByLabelText(/cvv/i), { target: { value: '123' } });
  fireEvent.change(screen.getByLabelText(/^cpf/i), { target: { value: '12345678901' } });
  fireEvent.change(screen.getByLabelText(/cep/i), { target: { value: '01310000' } });
  fireEvent.change(screen.getByLabelText(/número.*endereço/i), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText(/telefone/i), { target: { value: '11999999999' } });
  fireEvent.click(screen.getByRole('button', { name: /pagar/i }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ expiryMonth: '12', expiryYear: '2030' }), expect.anything(), '12345678901');
});
```

Run: `pnpm --filter @nutri-plus/web test card-form` → FAIL.

- [ ] **Step 2: Máscara + `<Button>` no card-form**

Em `card-form.tsx`: adicionar a máscara e usar `<Button>` no submit. Máscara:

```tsx
function maskExpiry(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 6); // MMAAAA
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
}
```
No handler do input de validade, aplicar a máscara: trocar o `Input('Validade', 'expiry', 'MM/AAAA')` por um input controlado que faz `onChange={(e) => setF({ ...f, expiry: maskExpiry(e.target.value) })}` (mantendo `aria-label="Validade"`). O `submit` continua `f.expiry.split('/')`. Import `import { Button } from '@/components/ui/button';` e trocar o `<button …>Pagar</button>` final por:

```tsx
<Button className="w-full" size="lg" disabled={loading} onClick={submit}>
  {loading ? 'Processando…' : 'Pagar'}
</Button>
```

- [ ] **Step 3: `<Button>` no plan-picker + pix-payment**

`plan-picker.tsx`: importar `Button`. Trocar os dois botões do toggle mensal/anual por `<Button variant={period===X?'default':'ghost'} size="sm" …>` (mantendo `aria-pressed`), e o CTA "Assinar" por `<Button className="mt-auto w-full" variant={pro?'default':'outline'} size="lg" onClick={() => onChoose(tier, period)}>Assinar {pro?'Pro':'Essencial'}</Button>`.

`pix-payment.tsx`: importar `Button`; trocar o botão copiar por `<Button variant="outline" className="w-full break-all" onClick={…}>{copied ? 'Copiado!' : 'Copiar código Pix'}</Button>`.

- [ ] **Step 4: Rodar teste + tsc + suíte**

Run: `pnpm --filter @nutri-plus/web test card-form plan-picker && pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: PASS + tsc limpo. Os testes existentes de plan-picker/card-form continuam verdes (labels/roles preservados).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/billing/card-form.tsx apps/web/src/components/billing/plan-picker.tsx apps/web/src/components/billing/pix-payment.tsx apps/web/src/components/billing/card-form.test.tsx
git commit -m "fix(web): máscara MM/AAAA na validade + botões via <Button>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: subscription-tab — faturas em PT + `<Button>` + dialogs de método

**Files:**
- Modify: `apps/web/src/components/settings/subscription-tab.tsx`
- Test: `apps/web/src/components/settings/subscription-tab.test.tsx` (estender)

**Interfaces:**
- Consumes: `Dialog`/`DialogContent`/`DialogHeader`/`DialogFooter`/`DialogTitle` (`@/components/ui/dialog`); `Button`; `CardForm`.

- [ ] **Step 1: Teste (falha primeiro)**

Estender `subscription-tab.test.tsx` (o mock de `@/lib/api/subscription` já expõe `updatePaymentMethod`):

```tsx
it('traduz status/método das faturas para português', () => {
  useSubscription.mockReturnValue({ data: { status: 'ACTIVE', plan: 'PRO', billingPeriod: 'MONTHLY', currentPeriodEnd: '2026-09-01T00:00:00Z', cancelAtPeriodEnd: false, paymentMethod: 'PIX', cardLast4: null, cardBrand: null, entitlements: { isReadOnly: false }, recentPayments: [{ id: 'p1', amount: 99, status: 'CONFIRMED', billingType: 'CREDIT_CARD', dueDate: '2026-08-10T00:00:00Z', paidAt: null }] }, refetch: vi.fn() });
  render(<SubscriptionTab />);
  expect(screen.getByText('Pago')).toBeInTheDocument();
  expect(screen.getByText('Cartão')).toBeInTheDocument();
});

it('pede confirmação num dialog antes de mudar para Pix', async () => {
  const updatePM = vi.fn().mockResolvedValue({ ok: true });
  // garantir no vi.mock('@/lib/api/subscription', …): updatePaymentMethod: (b:any)=>updatePM(b)
  useSubscription.mockReturnValue({ data: { status: 'ACTIVE', plan: 'PRO', billingPeriod: 'MONTHLY', currentPeriodEnd: '2026-09-01T00:00:00Z', cancelAtPeriodEnd: false, paymentMethod: 'CREDIT_CARD', cardLast4: '1234', cardBrand: 'VISA', entitlements: { isReadOnly: false }, recentPayments: [] }, refetch: vi.fn() });
  render(<SubscriptionTab />);
  fireEvent.click(screen.getByRole('button', { name: /mudar para pix/i }));
  // abre o dialog de confirmação; só executa ao confirmar
  expect(updatePM).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
  await waitFor(() => expect(updatePM).toHaveBeenCalledWith({ method: 'PIX' }));
});
```

Run: `pnpm --filter @nutri-plus/web test subscription-tab` → FAIL.

- [ ] **Step 2: Labels PT + `<Button>`**

No `subscription-tab.tsx`, adicionar os mapas e usá-los na tabela:

```tsx
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  CONFIRMED: 'Pago', RECEIVED: 'Pago', PENDING: 'Pendente', OVERDUE: 'Vencido', REFUNDED: 'Estornado',
};
const BILLING_TYPE_LABEL: Record<string, string> = { PIX: 'Pix', CREDIT_CARD: 'Cartão', BOLETO: 'Boleto' };
```
Na renderização: `<td>{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</td>` e `<td>{p.billingType ? (BILLING_TYPE_LABEL[p.billingType] ?? p.billingType) : '—'}</td>`. Trocar os `<a>`/`<button>` de ações por `<Button>` (Trocar plano vira `<Button asChild><a href="/assinatura">Trocar plano</a></Button>`; Cancelar → `<Button variant="outline" onClick={onCancel}>`).

- [ ] **Step 3: Dialogs de método**

Estado: `const [confirmPix, setConfirmPix] = useState(false)` e usar `editingCard` para abrir o card-form num `Dialog`. 
- "Mudar para Pix" abre `<Dialog open={confirmPix} onOpenChange={setConfirmPix}>` com `DialogTitle`="Mudar para Pix?", corpo explicando (o Pix não auto-renova; você recebe uma cobrança a cada ciclo), e `DialogFooter` com `<Button variant="outline" onClick={()=>setConfirmPix(false)}>Cancelar</Button>` + `<Button onClick={async()=>{ setConfirmPix(false); await onSwitchToPix(); }}>Confirmar</Button>`.
- "Trocar para cartão"/"Atualizar cartão" abre `<Dialog open={editingCard} onOpenChange={setEditingCard}>` com `DialogTitle`="Cartão" e `<CardForm onSubmit={onCardSubmit} loading={pmLoading} error={pmError} />` dentro do `DialogContent` (remover o render inline atual). No sucesso do `onCardSubmit`, `setEditingCard(false)` (já faz).

- [ ] **Step 4: Rodar teste + tsc**

Run: `pnpm --filter @nutri-plus/web test subscription-tab && pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: PASS + limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/settings/subscription-tab.tsx apps/web/src/components/settings/subscription-tab.test.tsx
git commit -m "feat(web): faturas em PT + dialogs de troca de método + <Button>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: shared-types + Prisma migration (change-plan + campos pending/token)

**Files:**
- Modify: `packages/shared-types/src/v1/billing.ts`
- Modify: `apps/api/prisma/schema.prisma` + nova migração

**Interfaces:**
- Produces: `ChangePlanRequest`, `ChangePlanResponse`; campos `Subscription.pendingPlan/pendingBillingPeriod/pendingChargeAsaasId/asaasCardToken`.

- [ ] **Step 1: shared-types**

Adicionar em `billing.ts` (após `PaymentMethodRequest`):

```ts
export interface ChangePlanRequest {
  plan: PlanTier;
  period: BillingPeriod;
}

export type ChangePlanResponse =
  | { kind: 'UPGRADE'; method: 'PIX'; pixQrCode: PixQrCode; amount: number }
  | { kind: 'UPGRADE'; method: 'CREDIT_CARD'; status: 'ACTIVE' | 'PENDING'; amount: number }
  | { kind: 'SCHEDULED'; effectiveDate: string };
```

Run: `pnpm --filter @nutri-plus/shared-types build` → limpo.

- [ ] **Step 2: Prisma — 4 campos**

No `model Subscription`, adicionar:

```prisma
  pendingPlan          PlanTier?
  pendingBillingPeriod BillingPeriod?
  pendingChargeAsaasId String?
  asaasCardToken       String?
```

- [ ] **Step 3: Migração + generate + tsc**

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name change_plan_fields`
Run: `pnpm --filter @nutri-plus/api exec prisma generate && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: 4 colunas nullable adicionadas; nada existente alterado; client expõe os campos; tsc limpo.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/v1/billing.ts apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: tipos de change-plan + campos pending/token na Subscription

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: AsaasService — createOneOffCharge + updateSubscriptionValue + token do cartão

**Files:**
- Modify: `apps/api/src/billing/asaas.service.ts`
- Test: `apps/api/src/billing/asaas.service.spec.ts` (estender)

**Interfaces:**
- Produces:
  - `createOneOffCharge(input: { customerId: string; value: number; billingType: 'PIX' | 'CREDIT_CARD'; description: string; creditCardToken?: string }): Promise<{ paymentId: string; status: 'ACTIVE' | 'PENDING'; pixQrCode?: PixQrCode }>`
  - `updateSubscriptionValue(subscriptionId: string, input: { value: number; cycle?: 'MONTHLY' | 'YEARLY' }): Promise<void>`
  - `createCardSubscription`/`updateSubscriptionBilling` passam a retornar também `creditCardToken: string | null`.

- [ ] **Step 1: Testes (falham primeiro)**

Adicionar ao `asaas.service.spec.ts`:

```ts
it('createOneOffCharge Pix cria /payments e busca o QR', async () => {
  jest.spyOn(global, 'fetch' as any)
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ id: 'pay_9', status: 'PENDING' }) } as any)
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ encodedImage: 'B64', payload: 'p' }) } as any);
  const out = await new AsaasService(config(CFG)).createOneOffCharge({ customerId: 'cus_1', value: 25, billingType: 'PIX', description: 'Upgrade' });
  expect(out).toEqual({ paymentId: 'pay_9', status: 'PENDING', pixQrCode: { encodedImage: 'B64', payload: 'p' } });
});

it('createOneOffCharge cartão usa o token e mapeia CONFIRMED → ACTIVE', async () => {
  const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ id: 'pay_10', status: 'CONFIRMED' }) } as any);
  const out = await new AsaasService(config(CFG)).createOneOffCharge({ customerId: 'cus_1', value: 25, billingType: 'CREDIT_CARD', description: 'Upgrade', creditCardToken: 'tok_1' });
  expect(out).toEqual({ paymentId: 'pay_10', status: 'ACTIVE' });
  expect((fetchMock.mock.calls[0][1] as any).body).toContain('"creditCardToken":"tok_1"');
});

it('updateSubscriptionValue faz POST /subscriptions/{id} com value/cycle', async () => {
  const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, status: 200, text: async () => '{}' } as any);
  await new AsaasService(config(CFG)).updateSubscriptionValue('sub_1', { value: 990, cycle: 'YEARLY' });
  expect(fetchMock.mock.calls[0][0]).toBe('https://api-sandbox.asaas.com/v3/subscriptions/sub_1');
  expect((fetchMock.mock.calls[0][1] as any).body).toContain('"value":990');
  expect((fetchMock.mock.calls[0][1] as any).body).toContain('"cycle":"YEARLY"');
});
```

*(E ajustar o teste de `createCardSubscription` pra também esperar `creditCardToken` no retorno — o mock da subscription passa a devolver `creditCard: { creditCardNumber:'1234', creditCardBrand:'MASTERCARD', creditCardToken:'tok_x' }` e o retorno inclui `creditCardToken: 'tok_x'`.)*

Run: `pnpm --filter @nutri-plus/api test asaas.service` → FAIL.

- [ ] **Step 2: Implementar**

Adicionar ao `asaas.service.ts`:

```ts
  async createOneOffCharge(input: {
    customerId: string; value: number; billingType: 'PIX' | 'CREDIT_CARD'; description: string; creditCardToken?: string;
  }): Promise<{ paymentId: string; status: 'ACTIVE' | 'PENDING'; pixQrCode?: PixQrCode }> {
    let payment: { id: string; status: string };
    try {
      payment = await this.call('/payments', {
        method: 'POST',
        body: {
          customer: input.customerId, billingType: input.billingType, value: input.value,
          dueDate: this.todaySaoPaulo(), description: input.description,
          ...(input.billingType === 'CREDIT_CARD' ? { creditCardToken: input.creditCardToken } : {}),
        },
      });
    } catch (e) {
      if (input.billingType === 'CREDIT_CARD' && e instanceof AsaasRequestError && e.status >= 400 && e.status < 500) {
        throw new UnprocessableEntityException({ code: 'CARD_DECLINED', message: 'Cartão recusado. Confira os dados ou tente outro cartão.' });
      }
      throw new BadGatewayException('Falha ao falar com o Asaas');
    }
    if (input.billingType === 'PIX') {
      const qr = await this.callOrGateway<{ encodedImage: string; payload: string }>(`/payments/${payment.id}/pixQrCode`, { method: 'GET' });
      return { paymentId: payment.id, status: 'PENDING', pixQrCode: { encodedImage: qr.encodedImage, payload: qr.payload } };
    }
    const status: 'ACTIVE' | 'PENDING' = payment.status === 'CONFIRMED' || payment.status === 'RECEIVED' ? 'ACTIVE' : 'PENDING';
    return { paymentId: payment.id, status };
  }

  async updateSubscriptionValue(subscriptionId: string, input: { value: number; cycle?: 'MONTHLY' | 'YEARLY' }): Promise<void> {
    await this.callOrGateway(`/subscriptions/${subscriptionId}`, {
      method: 'POST',
      body: { value: input.value, ...(input.cycle ? { cycle: input.cycle } : {}) },
    });
  }
```

Em `createCardSubscription`: o tipo local `sub` ganha `creditCardToken?: string` no `creditCard`, e o retorno passa a incluir `creditCardToken: sub.creditCard?.creditCardToken ?? null` (ajustar a assinatura de retorno para `{ subscriptionId; status; cardLast4; cardBrand; creditCardToken: string | null }`). Idem em `updateSubscriptionBilling` (retorna `{ cardLast4; cardBrand; creditCardToken: string | null }`; no branch PIX, `creditCardToken: null`).

- [ ] **Step 3: Rodar teste + tsc**

Run: `pnpm --filter @nutri-plus/api test asaas.service && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: PASS. *(tsc pode ripar em `subscription.service.ts` se o retorno de `createCardSubscription` mudou e o destructuring não lê `creditCardToken` — isso é ok, a Task 5 grava o token; mas como só ADICIONAMOS um campo ao retorno, o destructuring atual continua válido e o tsc deve ficar limpo.)*

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/billing/asaas.service.ts apps/api/src/billing/asaas.service.spec.ts
git commit -m "feat(api): Asaas createOneOffCharge + updateSubscriptionValue + token do cartão

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: SubscriptionService.changePlan + endpoint + webhook estendido

**Files:**
- Create: `apps/api/src/billing/dto/change-plan.dto.ts`
- Modify: `apps/api/src/billing/subscription.service.ts` (`changePlan`, `handleWebhook`, helpers; guarda `asaasCardToken` no checkout/updatePaymentMethod)
- Modify: `apps/api/src/billing/me-subscription.controller.ts` (rota `change-plan`)
- Test: `apps/api/src/billing/subscription.service.spec.ts` + `subscription-webhook.spec.ts` (estender)

**Interfaces:**
- Consumes: `AsaasService.createOneOffCharge/updateSubscriptionValue` (Task 4); `ChangePlanRequest/Response` (Task 3); `PLAN_CATALOG`.
- Produces: `changePlan(nutritionistId, dto): Promise<ChangePlanResponse>`; webhook aplica `pendingChargeAsaasId` (upgrade) + promove `pendingPlan` (agendado).

- [ ] **Step 1: DTO**

```ts
// apps/api/src/billing/dto/change-plan.dto.ts
import { IsIn } from 'class-validator';
import type { BillingPeriod, PlanTier } from '@nutri-plus/shared-types';

export class ChangePlanDto {
  @IsIn(['ESSENCIAL', 'PRO']) plan!: PlanTier;
  @IsIn(['MONTHLY', 'YEARLY']) period!: BillingPeriod;
}
```

- [ ] **Step 2: Testes (falham primeiro)**

Adicionar ao `subscription.service.spec.ts`:

```ts
const activeSub = (over: any = {}) => ({ id: 's1', nutritionistId: 'n1', status: 'ACTIVE', asaasSubscriptionId: 'sub_1', asaasCustomerId: 'cus_1', plan: 'ESSENCIAL', billingPeriod: 'MONTHLY', currentPeriodEnd: new Date(Date.now() + 15 * 86400000), paymentMethod: 'CREDIT_CARD', asaasCardToken: 'tok_1', ...over });

it('changePlan upgrade no cartão cobra a diferença e aplica na hora (mantém vencimento)', async () => {
  const { svc, prisma, asaas } = deps(activeSub());
  asaas.createOneOffCharge = jest.fn().mockResolvedValue({ paymentId: 'pay_1', status: 'ACTIVE' });
  asaas.updateSubscriptionValue = jest.fn().mockResolvedValue(undefined);
  const out = await svc.changePlan('n1', { plan: 'PRO', period: 'MONTHLY' });
  expect(out).toMatchObject({ kind: 'UPGRADE', method: 'CREDIT_CARD', status: 'ACTIVE' });
  expect(out.amount).toBeGreaterThan(0);
  expect(asaas.createOneOffCharge).toHaveBeenCalledWith(expect.objectContaining({ billingType: 'CREDIT_CARD', creditCardToken: 'tok_1' }));
  expect(asaas.updateSubscriptionValue).toHaveBeenCalledWith('sub_1', { value: 99 });
  const data = prisma.subscription.update.mock.calls[0][0].data;
  expect(data).toMatchObject({ plan: 'PRO' });
  expect(data.currentPeriodEnd).toBeUndefined(); // mantém o vencimento
});

it('changePlan upgrade no Pix guarda pendingChargeAsaasId + retorna QR, sem mudar o plano ainda', async () => {
  const { svc, prisma, asaas } = deps(activeSub({ paymentMethod: 'PIX', asaasCardToken: null }));
  asaas.createOneOffCharge = jest.fn().mockResolvedValue({ paymentId: 'pay_2', status: 'PENDING', pixQrCode: { encodedImage: 'B64', payload: 'p' } });
  const out = await svc.changePlan('n1', { plan: 'PRO', period: 'MONTHLY' });
  expect(out).toMatchObject({ kind: 'UPGRADE', method: 'PIX', pixQrCode: { encodedImage: 'B64', payload: 'p' } });
  const data = prisma.subscription.update.mock.calls[0][0].data;
  expect(data).toMatchObject({ pendingPlan: 'PRO', pendingChargeAsaasId: 'pay_2' });
  expect(data.plan).toBeUndefined();
});

it('changePlan downgrade/período agenda pro próximo ciclo (sem cobrança)', async () => {
  const { svc, prisma, asaas } = deps(activeSub({ plan: 'PRO' }));
  asaas.updateSubscriptionValue = jest.fn().mockResolvedValue(undefined);
  asaas.createOneOffCharge = jest.fn();
  const out = await svc.changePlan('n1', { plan: 'ESSENCIAL', period: 'MONTHLY' });
  expect(out).toMatchObject({ kind: 'SCHEDULED' });
  expect(asaas.createOneOffCharge).not.toHaveBeenCalled();
  expect(asaas.updateSubscriptionValue).toHaveBeenCalledWith('sub_1', { value: 49, cycle: 'MONTHLY' });
  expect(prisma.subscription.update.mock.calls[0][0].data).toMatchObject({ pendingPlan: 'ESSENCIAL' });
});

it('changePlan rejeita quando não está ACTIVE', async () => {
  const { svc } = deps({ id: 's1', nutritionistId: 'n1', status: 'TRIALING' });
  await expect(svc.changePlan('n1', { plan: 'PRO', period: 'MONTHLY' })).rejects.toBeDefined();
});
```

Adicionar ao `subscription-webhook.spec.ts`:

```ts
it('webhook do diff (pendingChargeAsaasId) aplica o upgrade e limpa o pending', async () => {
  const prisma = {
    subscription: {
      findFirst: jest.fn()
        .mockResolvedValueOnce({ id: 's1', asaasSubscriptionId: 'sub_1', pendingPlan: 'PRO', pendingBillingPeriod: 'MONTHLY', pendingChargeAsaasId: 'pay_2', billingPeriod: 'MONTHLY' }),
      update: jest.fn().mockResolvedValue({}),
    },
    subscriptionPayment: { upsert: jest.fn().mockResolvedValue({}) },
  } as any;
  const asaas = { updateSubscriptionValue: jest.fn().mockResolvedValue(undefined) } as any;
  const svc = new SubscriptionService(prisma, {} as any, asaas);
  await svc.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_2', value: 25, status: 'CONFIRMED' } });
  expect(asaas.updateSubscriptionValue).toHaveBeenCalledWith('sub_1', { value: 99 });
  expect(prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ plan: 'PRO', pendingChargeAsaasId: null }) }));
});

it('webhook do ciclo com pendingPlan agendado promove o plano', async () => {
  const prisma = {
    subscription: {
      findFirst: jest.fn()
        .mockResolvedValueOnce(null) // não é diff de upgrade
        .mockResolvedValueOnce({ id: 's1', asaasSubscriptionId: 'sub_1', pendingPlan: 'ESSENCIAL', pendingBillingPeriod: 'MONTHLY', pendingChargeAsaasId: null, billingPeriod: 'MONTHLY' }),
      update: jest.fn().mockResolvedValue({}),
    },
    subscriptionPayment: { upsert: jest.fn().mockResolvedValue({}) },
  } as any;
  const svc = new SubscriptionService(prisma, {} as any, {} as any);
  await svc.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: 'cycle_1', subscription: 'sub_1', value: 49, status: 'CONFIRMED', dueDate: '2026-09-01' } });
  expect(prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ plan: 'ESSENCIAL', pendingPlan: null }) }));
});
```

Run: `pnpm --filter @nutri-plus/api test subscription.service subscription-webhook` → FAIL.

- [ ] **Step 3: Implementar changePlan + helpers + webhook**

Em `subscription.service.ts`, importar `ChangePlanRequest, ChangePlanResponse` de shared-types, `UnprocessableEntityException`. Adicionar helpers no topo do arquivo (fora da classe):

```ts
const TIER_RANK: Record<'ESSENCIAL' | 'PRO', number> = { ESSENCIAL: 0, PRO: 1 };
function planValue(plan: 'ESSENCIAL' | 'PRO', period: 'MONTHLY' | 'YEARLY'): number {
  const c = PLAN_CATALOG[plan];
  return period === 'MONTHLY' ? c.monthlyBrl : c.yearlyBrl;
}
```

Método `changePlan`:

```ts
  async changePlan(nutritionistId: string, dto: ChangePlanRequest): Promise<ChangePlanResponse> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub || sub.status !== 'ACTIVE' || !sub.asaasSubscriptionId || !sub.asaasCustomerId || !sub.plan || !sub.billingPeriod || !sub.currentPeriodEnd) {
      throw new UnprocessableEntityException({ code: 'NOT_ACTIVE', message: 'Troca de plano só está disponível para uma assinatura ativa.' });
    }
    const currentTier = sub.plan as 'ESSENCIAL' | 'PRO';
    const currentPeriod = sub.billingPeriod as 'MONTHLY' | 'YEARLY';
    const newValue = planValue(dto.plan, dto.period);
    const isUpgrade = dto.period === currentPeriod && TIER_RANK[dto.plan] > TIER_RANK[currentTier];

    if (isUpgrade) {
      const cur = planValue(currentTier, currentPeriod);
      const cycleDays = currentPeriod === 'YEARLY' ? 365 : 30;
      const remainingDays = Math.max(0, Math.ceil((sub.currentPeriodEnd.getTime() - Date.now()) / 86400000));
      const diff = Math.round((newValue - cur) * remainingDays / cycleDays * 100) / 100;

      if (sub.paymentMethod === 'CREDIT_CARD') {
        if (!sub.asaasCardToken) {
          throw new UnprocessableEntityException({ code: 'CARD_TOKEN_MISSING', message: 'Atualize seu cartão em Configurações antes de fazer o upgrade.' });
        }
        const charge = await this.asaas.createOneOffCharge({ customerId: sub.asaasCustomerId, value: diff, billingType: 'CREDIT_CARD', creditCardToken: sub.asaasCardToken, description: `Upgrade nutri_plus ${dto.plan}` });
        await this.asaas.updateSubscriptionValue(sub.asaasSubscriptionId, { value: newValue });
        await this.prisma.subscription.update({ where: { nutritionistId }, data: { plan: dto.plan, billingPeriod: dto.period } });
        return { kind: 'UPGRADE', method: 'CREDIT_CARD', status: charge.status, amount: diff };
      }
      // PIX
      const charge = await this.asaas.createOneOffCharge({ customerId: sub.asaasCustomerId, value: diff, billingType: 'PIX', description: `Upgrade nutri_plus ${dto.plan}` });
      await this.prisma.subscription.update({ where: { nutritionistId }, data: { pendingPlan: dto.plan, pendingBillingPeriod: dto.period, pendingChargeAsaasId: charge.paymentId } });
      return { kind: 'UPGRADE', method: 'PIX', pixQrCode: charge.pixQrCode!, amount: diff };
    }

    // downgrade ou troca de período → agenda
    await this.asaas.updateSubscriptionValue(sub.asaasSubscriptionId, { value: newValue, cycle: dto.period });
    await this.prisma.subscription.update({ where: { nutritionistId }, data: { pendingPlan: dto.plan, pendingBillingPeriod: dto.period } });
    return { kind: 'SCHEDULED', effectiveDate: sub.currentPeriodEnd.toISOString() };
  }
```

Reescrever `handleWebhook` (extraindo `upsertPayment` e adicionando o branch de upgrade ANTES do early-return):

```ts
  async handleWebhook(event: AsaasWebhookEvent): Promise<void> {
    const p = event.payment;
    if (!p) return;
    const confirmed = event.event === 'PAYMENT_CONFIRMED' || event.event === 'PAYMENT_RECEIVED';

    // 1. Cobrança avulsa de upgrade (não tem p.subscription) — identifica por pendingChargeAsaasId.
    if (confirmed) {
      const upgradeSub = await this.prisma.subscription.findFirst({ where: { pendingChargeAsaasId: p.id } });
      if (upgradeSub) {
        const period = (upgradeSub.pendingBillingPeriod ?? upgradeSub.billingPeriod) as 'MONTHLY' | 'YEARLY';
        await this.asaas.updateSubscriptionValue(upgradeSub.asaasSubscriptionId!, { value: planValue(upgradeSub.pendingPlan as 'ESSENCIAL' | 'PRO', period) });
        await this.upsertPayment(upgradeSub.id, p);
        await this.prisma.subscription.update({
          where: { id: upgradeSub.id },
          data: { plan: upgradeSub.pendingPlan, billingPeriod: period, pendingPlan: null, pendingBillingPeriod: null, pendingChargeAsaasId: null },
        });
        return;
      }
    }

    if (!p.subscription) return;
    const sub = await this.prisma.subscription.findFirst({ where: { asaasSubscriptionId: p.subscription } });
    if (!sub) return;
    await this.upsertPayment(sub.id, p);

    if (confirmed) {
      if (sub.pendingPlan && !sub.pendingChargeAsaasId) {
        // downgrade/período agendado → promove neste ciclo
        const period = (sub.pendingBillingPeriod ?? sub.billingPeriod) as 'MONTHLY' | 'YEARLY';
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'ACTIVE', currentPeriodEnd: this.nextPeriodEnd(period, p.dueDate), plan: sub.pendingPlan, billingPeriod: period, pendingPlan: null, pendingBillingPeriod: null },
        });
      } else {
        await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', currentPeriodEnd: this.nextPeriodEnd(sub.billingPeriod, p.dueDate) } });
      }
    } else if (event.event === 'PAYMENT_OVERDUE') {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
    } else if (event.event === 'PAYMENT_REFUNDED' || event.event === 'SUBSCRIPTION_DELETED') {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELED' } });
    }
  }

  private async upsertPayment(subscriptionId: string, p: NonNullable<AsaasWebhookEvent['payment']>): Promise<void> {
    await this.prisma.subscriptionPayment.upsert({
      where: { asaasPaymentId: p.id },
      create: {
        subscriptionId, asaasPaymentId: p.id, amount: p.value, status: p.status,
        billingType: p.billingType ?? null,
        dueDate: p.dueDate ? new Date(p.dueDate) : null,
        paidAt: p.paymentDate ? new Date(p.paymentDate) : null,
      },
      update: { status: p.status, paidAt: p.paymentDate ? new Date(p.paymentDate) : null },
    });
  }
```

Guardar o `asaasCardToken` no `checkout` (cartão) e no `updatePaymentMethod`: capturar `creditCardToken` do retorno da Task 4 e incluir `asaasCardToken: creditCardToken` no `data` do `update` (no branch de cartão do checkout e no updatePaymentMethod). No branch PIX, `asaasCardToken: null`.

- [ ] **Step 4: Rota no controller**

Em `me-subscription.controller.ts`:

```ts
  @Post('change-plan')
  changePlan(@CurrentUser() ctx: AuthContext, @Body() dto: ChangePlanDto): Promise<ChangePlanResponse> {
    return this.subscription.changePlan(resolveScopeNutritionistId(ctx), dto);
  }
```
(importar `ChangePlanDto` e o tipo `ChangePlanResponse`.)

- [ ] **Step 5: Rodar testes + tsc + suíte**

Run: `pnpm --filter @nutri-plus/api test subscription.service subscription-webhook && pnpm --filter @nutri-plus/api exec tsc --noEmit && pnpm --filter @nutri-plus/api test`
Expected: PASS + tsc limpo + suíte verde.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/billing/dto/change-plan.dto.ts apps/api/src/billing/subscription.service.ts apps/api/src/billing/subscription.service.spec.ts apps/api/src/billing/subscription-webhook.spec.ts apps/api/src/billing/me-subscription.controller.ts
git commit -m "feat(api): change-plan (upgrade prorateado + downgrade/período agendado) + webhook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Web — troca de plano (página /assinatura + PlanPicker plano atual + client)

**Files:**
- Modify: `apps/web/src/lib/api/subscription.ts` (`changePlan`)
- Modify: `apps/web/src/components/billing/plan-picker.tsx` (props `currentPlan`/`currentPeriod`)
- Modify: `apps/web/src/app/(checkout)/assinatura/page.tsx` (fluxo ativo + sem auto-redirect)
- Test: `apps/web/src/app/(checkout)/assinatura/page.test.tsx` (estender)

**Interfaces:**
- Consumes: `ChangePlanRequest/Response` (shared-types); `changePlan` client; `PlanPicker` com `currentPlan`.

- [ ] **Step 1: Client `changePlan`**

Em `lib/api/subscription.ts`:

```ts
import type { ChangePlanRequest, ChangePlanResponse } from '@nutri-plus/shared-types';
export function changePlan(body: ChangePlanRequest): Promise<ChangePlanResponse> {
  return browserApiFetch<ChangePlanResponse>('/me/subscription/change-plan', { method: 'POST', body });
}
```

- [ ] **Step 2: PlanPicker destaca o plano atual**

Estender a assinatura: `PlanPicker({ onChoose, currentPlan, currentPeriod }: { onChoose: (...); currentPlan?: PlanTier; currentPeriod?: BillingPeriod })`. Inicializar `period` com `currentPeriod ?? 'MONTHLY'`. Para cada card, se `tier === currentPlan && period === currentPeriod` → mostrar um selo "Seu plano atual" e desabilitar o botão (`<Button disabled>Plano atual</Button>`); senão o CTA mostra "Assinar"/"Trocar" normalmente (chama `onChoose`).

- [ ] **Step 3: Teste da página (falha primeiro)**

Estender `page.test.tsx` (mock de `@/lib/api/subscription` ganha `changePlan`):

```tsx
it('assinante ativo NÃO é redirecionado e vê o picker com o plano atual', () => {
  useQuery.mockReturnValue({ data: { status: 'ACTIVE', plan: 'ESSENCIAL', billingPeriod: 'MONTHLY', onboardedAt: '2026-08-01T00:00:00Z', entitlements: { isReadOnly: false } } });
  render(<AssinaturaPage />);
  expect(replace).not.toHaveBeenCalledWith('/');
  expect(screen.getByText(/seu plano atual/i)).toBeInTheDocument();
});

it('upgrade no cartão chama changePlan e mostra sucesso', async () => {
  const changePlan = vi.fn().mockResolvedValue({ kind: 'UPGRADE', method: 'CREDIT_CARD', status: 'ACTIVE', amount: 25 });
  // adicionar changePlan ao vi.mock('@/lib/api/subscription', …)
  useQuery.mockReturnValue({ data: { status: 'ACTIVE', plan: 'ESSENCIAL', billingPeriod: 'MONTHLY', paymentMethod: 'CREDIT_CARD', onboardedAt: '2026-08-01T00:00:00Z', entitlements: { isReadOnly: false } } });
  render(<AssinaturaPage />);
  fireEvent.click(screen.getByRole('button', { name: /assinar pro|trocar|fazer upgrade/i }));
  await waitFor(() => expect(changePlan).toHaveBeenCalledWith({ plan: 'PRO', period: 'MONTHLY' }));
  await waitFor(() => expect(screen.getByText(/upgrade|pagou|plano alterado/i)).toBeInTheDocument());
});
```

Run: `pnpm --filter @nutri-plus/web test app/\(checkout\)/assinatura` → FAIL.

- [ ] **Step 4: Reescrever a página**

Em `app/(checkout)/assinatura/page.tsx`:
- Remover o `useEffect(() => { if (active) router.replace('/') }, …)` e o early-return "Assinatura ativa 🎉".
- Estado novo: `const [done, setDone] = useState<null | { text: string }>(null)` e `const [changePix, setChangePix] = useState<PixQrCode | null>(null)`.
- `const isActive = Boolean(data?.status === 'ACTIVE' && !data?.entitlements.isReadOnly)`.
- Se `done` → tela de sucesso (`done.text`) + `<Button asChild><a href="/">Ir para o painel</a></Button>`.
- Se `isActive`: renderizar `<PlanPicker currentPlan={data!.plan ?? undefined} currentPeriod={data!.billingPeriod ?? undefined} onChoose={onChangePlan} />` (não mostra o CTA de trial). `onChangePlan(plan, period)`:
  ```tsx
  async function onChangePlan(plan, period) {
    setLoading(true); setError(null);
    try {
      const res = await changePlan({ plan, period });
      if (res.kind === 'SCHEDULED') setDone({ text: `Seu plano muda em ${new Date(res.effectiveDate).toLocaleDateString('pt-BR')}.` });
      else if (res.method === 'CREDIT_CARD') { await queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY }); setDone({ text: `Upgrade concluído! Você pagou R$ ${res.amount.toLocaleString('pt-BR')}.` }); }
      else setChangePix(res.pixQrCode); // Pix: mostra o QR e faz poll
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) { const b = err.body as { code?: string; message?: string } | null; setError(b?.message ?? 'Não foi possível trocar de plano.'); }
      else setError('Não foi possível trocar de plano. Tente novamente.');
    } finally { setLoading(false); }
  }
  ```
  Se `changePix` setado → renderizar `<PixPayment pixQrCode={changePix} />` + "Pague a diferença para concluir o upgrade" + um `useEffect` que, quando `data.plan` virar o novo plano (poll do `useQuery`), faz `setDone({ text: 'Upgrade concluído!' })`.
- Se **não** `isActive` → o fluxo de trial/checkout atual (inalterado).
- Trocar os `<button>` da página por `<Button>`.

- [ ] **Step 5: Rodar teste + tsc + suíte**

Run: `pnpm --filter @nutri-plus/web test app/\(checkout\)/assinatura && pnpm --filter @nutri-plus/web exec tsc --noEmit && pnpm --filter @nutri-plus/web test`
Expected: PASS + limpo + suíte verde.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api/subscription.ts apps/web/src/components/billing/plan-picker.tsx apps/web/src/app/\(checkout\)/assinatura/page.tsx apps/web/src/app/\(checkout\)/assinatura/page.test.tsx
git commit -m "feat(web): troca de plano (upgrade pro-rata / agendado) + plano atual no picker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificação final (após todas as tarefas)

- [ ] shared-types: `pnpm --filter @nutri-plus/shared-types build` — limpo.
- [ ] API: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit` — verde.
- [ ] Web: `pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit` — verde.
- [ ] Mobile: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` — limpo (intocado).

## Notas de escopo / decisões travadas

- **Upgrade** (mesmo período, tier↑) cobra a diferença pro-rata e mantém o vencimento; **downgrade/período** agendam pro próximo ciclo. Proração **só** para `status===ACTIVE`; trial usa checkout normal.
- **I2 fechado:** upgrade concede só na confirmação (cartão síncrono / Pix webhook); downgrade/período promovidos no webhook do ciclo.
- **Cartão legado sem `asaasCardToken`:** upgrade retorna 422 `CARD_TOKEN_MISSING` → UI pede pra atualizar o cartão em Configurações primeiro (raro; novas assinaturas guardam o token).
- **PCI:** só `cardLast4`/`cardBrand`/`asaasCardToken`; nunca o PAN; nunca logado.
- **Mobile/paciente intocados.**

