# Payment Receipt / Welcome Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar um e-mail transacional via Resend a cada pagamento Asaas confirmado: boas-vindas na primeira ativação e recibo nas renovações, sem atrasar a assinatura.

**Architecture:** O webhook que já marca `ACTIVE` passa a enviar e-mail best-effort depois do upsert. `receiptEmailSentAt` em `SubscriptionPayment` garante idempotência. O copy vive num builder puro; o `ResendService` existente ganha `sendEmail` genérico.

**Tech Stack:** NestJS 10 · Prisma 7 · Resend HTTP API (`fetch`) · Jest.

## Global Constraints

- Sem dependência npm nova. Resend continua via `fetch` em `https://api.resend.com/emails`.
- Texto de e-mail em **pt-BR**. Aspas da API: single quotes.
- Pagamento **nunca** espera o e-mail: falha de Resend/env → `Logger.warn`, webhook 200, `receiptEmailSentAt` permanece `null`.
- Idempotente por `asaasPaymentId` / `receiptEmailSentAt`.
- Remetente = `SUPPORT_FROM_EMAIL`. Destinatário = `nutritionist.user.email`. Sem `reply_to` no recibo.
- Variante `welcome` se `previousStatus !== 'ACTIVE'`; `renewal` se já era `ACTIVE`.
- Testes API: `pnpm --filter @nutri-plus/api test <file>`.
- Branch `feat/payment-receipt-email`. Não push/PR neste plano.

---

## File Structure

- Modify `apps/api/src/support/resend.service.ts` — `sendEmail` genérico; `sendSupportEmail` vira wrapper.
- Modify `apps/api/src/support/resend.service.spec.ts` — html opcional, omitir `reply_to`.
- Modify `apps/api/src/support/support.module.ts` — exportar `ResendService`.
- Create `apps/api/src/billing/payment-receipt-email.ts` — builder puro `{ subject, text, html }`.
- Create `apps/api/src/billing/payment-receipt-email.spec.ts`.
- Modify `apps/api/prisma/schema.prisma` — `SubscriptionPayment.receiptEmailSentAt DateTime?`.
- Create migration `apps/api/prisma/migrations/<ts>_payment_receipt_email_sent_at/migration.sql`.
- Modify `apps/api/src/billing/subscription.service.ts` — enviar após CONFIRMED/RECEIVED.
- Modify `apps/api/src/billing/subscription-webhook.spec.ts` + `subscription.service.spec.ts` — novos deps do construtor.
- Modify `apps/api/src/billing/billing.module.ts` — importar `SupportModule`.

---

### Task 1: ResendService.sendEmail

**Files:**
- Modify: `apps/api/src/support/resend.service.ts`
- Modify: `apps/api/src/support/resend.service.spec.ts`
- Modify: `apps/api/src/support/support.module.ts`

**Interfaces:**
- Produces: `sendEmail(input: { to: string; from: string; subject: string; text: string; html?: string; replyTo?: string }): Promise<void>`
- Produces: `sendSupportEmail` continua existindo e chama `sendEmail`

- [ ] **Step 1: Testes novos em `resend.service.spec.ts`**

Adicionar depois dos testes existentes:

```ts
it('sendEmail inclui html e omite reply_to quando ausente', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true, status: 200, text: async () => '{}',
  } as Response);
  const svc = new ResendService({ get: () => 're_key' } as any);
  await svc.sendEmail({
    to: 'a@x.com', from: 'iNutri <suporte@inutri.life>',
    subject: 'subj', text: 'txt', html: '<p>txt</p>',
  });
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
  expect(body).toEqual({
    from: 'iNutri <suporte@inutri.life>',
    to: ['a@x.com'],
    subject: 'subj',
    text: 'txt',
    html: '<p>txt</p>',
  });
  expect(body.reply_to).toBeUndefined();
});
```

- [ ] **Step 2: Rodar o spec e ver o teste novo falhar**

Run: `pnpm --filter @nutri-plus/api test resend.service`

Expected: FAIL (`sendEmail` is not a function)

- [ ] **Step 3: Implementar**

```ts
export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export type SendSupportEmailInput = SendEmailInput & { replyTo: string };

async sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = this.config.get<string>('RESEND_API_KEY');
  if (!apiKey) {
    throw new ServiceUnavailableException('Envio de e-mail não configurado (RESEND_API_KEY)');
  }
  const payload: Record<string, unknown> = {
    from: input.from,
    to: [input.to],
    subject: input.subject,
    text: input.text,
  };
  if (input.html) payload.html = input.html;
  if (input.replyTo) payload.reply_to = input.replyTo;

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new BadGatewayException('Provedor de e-mail indisponível');
  }
  const text = await res.text();
  if (!res.ok) {
    this.logger.warn(`Resend POST /emails → ${res.status}: ${text.slice(0, 300)}`);
    throw new BadGatewayException('Falha ao enviar e-mail');
  }
}

async sendSupportEmail(input: SendSupportEmailInput): Promise<void> {
  return this.sendEmail(input);
}
```

Em `support.module.ts`: `exports: [ResendService]`.

- [ ] **Step 4: Rodar testes**

Run: `pnpm --filter @nutri-plus/api test resend.service`

Expected: PASS (inclui os 3 testes antigos de suporte)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/support/resend.service.ts apps/api/src/support/resend.service.spec.ts apps/api/src/support/support.module.ts
git commit -m "feat(api): generalize ResendService.sendEmail"
```

---

### Task 2: Builder do e-mail de recibo

**Files:**
- Create: `apps/api/src/billing/payment-receipt-email.ts`
- Create: `apps/api/src/billing/payment-receipt-email.spec.ts`

**Interfaces:**
- Consumes: nada (puro)
- Produces:

```ts
export type ReceiptVariant = 'welcome' | 'renewal';
export interface PaymentReceiptInput {
  variant: ReceiptVariant;
  name: string;
  plan: 'ESSENCIAL' | 'PRO' | null;
  period: 'MONTHLY' | 'YEARLY' | null;
  amount: number;
  periodEnd: Date;
  dashboardUrl: string;
}
export function buildPaymentReceiptEmail(input: PaymentReceiptInput): { subject: string; text: string; html: string }
```

- [ ] **Step 1: Teste que falha**

```ts
import { buildPaymentReceiptEmail } from './payment-receipt-email';

const base = {
  name: 'Ana',
  plan: 'PRO' as const,
  period: 'MONTHLY' as const,
  amount: 99,
  periodEnd: new Date('2026-09-10T00:00:00.000Z'),
  dashboardUrl: 'https://app.inutri.life',
};

describe('buildPaymentReceiptEmail', () => {
  it('welcome: assunto + cumprimento + CTA', () => {
    const mail = buildPaymentReceiptEmail({ ...base, variant: 'welcome' });
    expect(mail.subject).toBe('Bem-vindo ao iNutri — assinatura Pro ativada');
    expect(mail.text).toMatch(/Olá, Ana/);
    expect(mail.text).toMatch(/sua assinatura está ativa/i);
    expect(mail.text).toMatch(/R\$\s*99,00/);
    expect(mail.text).toMatch(/10\/09\/2026/);
    expect(mail.text).toContain('https://app.inutri.life');
    expect(mail.html).toContain('https://app.inutri.life');
  });

  it('renewal: assunto de confirmação, sem bem-vindo', () => {
    const mail = buildPaymentReceiptEmail({ ...base, variant: 'renewal' });
    expect(mail.subject).toBe('Pagamento confirmado — iNutri Pro');
    expect(mail.text).toMatch(/recebemos o pagamento da sua renovação/i);
    expect(mail.text).not.toMatch(/Bem-vindo/);
    expect(mail.subject).not.toMatch(/Bem-vindo/);
  });

  it('plan null omite o tier no assunto', () => {
    const mail = buildPaymentReceiptEmail({ ...base, variant: 'welcome', plan: null });
    expect(mail.subject).toBe('Bem-vindo ao iNutri — assinatura ativada');
    expect(mail.text).toMatch(/sua assinatura/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/api test payment-receipt-email`

Expected: FAIL (módulo não existe)

- [ ] **Step 3: Implementar o builder**

Rótulos: `ESSENCIAL` → `Essencial`, `PRO` → `Pro`, `MONTHLY` → `mensal`, `YEARLY` → `anual`.
Valor: `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount)`.
Data: `periodEnd.toLocaleDateString('pt-BR', { timeZone: 'UTC' })`.
Se `plan` é null: assunto sem tier; corpo usa `sua assinatura` (sem “Essencial/Pro”).

Welcome subject: `Bem-vindo ao iNutri — assinatura ${tier} ativada` ou `Bem-vindo ao iNutri — assinatura ativada`.
Renewal subject: `Pagamento confirmado — iNutri ${tier}` ou `Pagamento confirmado — iNutri`.

HTML: parágrafos simples espelhando o texto + `<a href="{dashboardUrl}">`.

- [ ] **Step 4: Rodar testes**

Run: `pnpm --filter @nutri-plus/api test payment-receipt-email`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/billing/payment-receipt-email.ts apps/api/src/billing/payment-receipt-email.spec.ts
git commit -m "feat(api): payment receipt email copy builder"
```

---

### Task 3: Schema + webhook

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`SubscriptionPayment`)
- Create: `apps/api/prisma/migrations/<ts>_payment_receipt_email_sent_at/migration.sql`
- Modify: `apps/api/src/billing/subscription.service.ts`
- Modify: `apps/api/src/billing/subscription-webhook.spec.ts`
- Modify: `apps/api/src/billing/subscription.service.spec.ts`
- Modify: `apps/api/src/billing/billing.module.ts`

**Interfaces:**
- Consumes: `ResendService.sendEmail`, `buildPaymentReceiptEmail`
- Produces: `handleWebhook` envia e-mail nas regras da spec; construtor ganha `(prisma, entitlements, asaas, resend, config)`

- [ ] **Step 1: Campo + migration**

Em `SubscriptionPayment`, depois de `paidAt`:

```
receiptEmailSentAt DateTime?
```

Migration SQL:

```sql
-- AlterTable
ALTER TABLE "SubscriptionPayment" ADD COLUMN "receiptEmailSentAt" TIMESTAMP(3);
```

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name payment_receipt_email_sent_at`

Se o CLI gerar o dir, usar o SQL gerado (equivalente ao acima). Depois `prisma generate`.

- [ ] **Step 2: Testes do webhook (falham no construtor/comportamento)**

Substituir `svcWith` para aceitar status/plan/user e injetar resend+config:

```ts
function svcWith(sub: any, opts?: { paymentRow?: any; resend?: any; config?: Record<string, string | undefined> }) {
  const paymentRow = opts?.paymentRow ?? { id: 'row_1', receiptEmailSentAt: null };
  const prisma = {
    subscription: { findFirst: jest.fn().mockResolvedValue(sub), update: jest.fn().mockResolvedValue({}) },
    subscriptionPayment: {
      upsert: jest.fn().mockResolvedValue(paymentRow),
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;
  const resend = opts?.resend ?? { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const cfg = { WEB_ORIGIN: 'https://app.test', SUPPORT_FROM_EMAIL: 'iNutri <suporte@inutri.life>', ...opts?.config };
  const config = { get: (k: string) => cfg[k], getOrThrow: (k: string) => {
    const v = cfg[k]; if (v == null) throw new Error(k); return v;
  } } as any;
  return { prisma, resend, svc: new SubscriptionService(prisma, {} as any, {} as any, resend, config) };
}

const nutri = { user: { name: 'Ana', email: 'ana@x.com' } };
const payment = { id: 'pay_1', subscription: 'sub_1', value: 49, status: 'CONFIRMED', billingType: 'PIX', dueDate: '2026-08-10', paymentDate: '2026-08-04' };
```

Casos (além dos 3 existentes, que precisam do 5º/6º arg e de `nutritionist` no sub):

- `TRIALING` + `PAYMENT_CONFIRMED` → `resend.sendEmail` chamado, assunto contém `Bem-vindo`, `subscriptionPayment.update` com `receiptEmailSentAt`.
- Já `ACTIVE` + `PAYMENT_RECEIVED` → assunto contém `Pagamento confirmado`, não `Bem-vindo`.
- `receiptEmailSentAt` já preenchido → `sendEmail` **não** chamado.
- `sendEmail` rejeita → `subscription.update` ACTIVE mesmo assim; `subscriptionPayment.update` de sentAt **não** chamado; handler não relança.
- `PAYMENT_OVERDUE` → `sendEmail` não chamado.

Atualizar `subscription.service.spec.ts` `deps()`:

```ts
return { prisma, entitlements, asaas, svc: new SubscriptionService(prisma, entitlements, asaas, { sendEmail: jest.fn() } as any, { get: () => undefined, getOrThrow: (k: string) => k } as any) };
```

- [ ] **Step 3: Rodar webhook spec — deve falhar**

Run: `pnpm --filter @nutri-plus/api test subscription-webhook`

Expected: FAIL (construtor ainda tem 3 args / e-mail não enviado)

- [ ] **Step 4: Implementar handleWebhook**

`BillingModule.imports` inclui `SupportModule` (já exporta `ResendService`). `ConfigModule` já está lá.

Construtor:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly entitlements: EntitlementsService,
  private readonly asaas: AsaasService,
  private readonly resend: ResendService,
  private readonly config: ConfigService,
) {}
```

`findFirst` inclui `nutritionist: { include: { user: { select: { name: true, email: true } } } }`.
Guardar `previousStatus = sub.status`.
Capturar o retorno do `upsert`.
Depois das transições de status, se evento é CONFIRMED/RECEIVED e `!row.receiptEmailSentAt`:

```ts
try {
  const from = this.config.get<string>('SUPPORT_FROM_EMAIL');
  if (!from) throw new Error('SUPPORT_FROM_EMAIL ausente');
  const dashboardUrl = this.config.getOrThrow<string>('WEB_ORIGIN');
  const periodEnd = this.nextPeriodEnd(sub.billingPeriod, p.dueDate);
  const mail = buildPaymentReceiptEmail({
    variant: previousStatus === 'ACTIVE' ? 'renewal' : 'welcome',
    name: sub.nutritionist.user.name,
    plan: sub.plan,
    period: sub.billingPeriod,
    amount: p.value,
    periodEnd,
    dashboardUrl,
  });
  await this.resend.sendEmail({
    to: sub.nutritionist.user.email,
    from,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  await this.prisma.subscriptionPayment.update({
    where: { id: row.id },
    data: { receiptEmailSentAt: new Date() },
  });
} catch (err) {
  this.logger.warn(`Falha ao enviar e-mail de recibo pay=${p.id}: ${err instanceof Error ? err.message : err}`);
}
```

Adicionar `private readonly logger = new Logger(SubscriptionService.name);`.

- [ ] **Step 5: Rodar testes**

Run: `pnpm --filter @nutri-plus/api test subscription-webhook subscription.service support.service`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/billing
git commit -m "feat(api): send payment receipt email on Asaas confirm"
```

---

## Self-review

- Spec trigger, tom, conteúdo, best-effort, idempotência, testes, fora de escopo → Tasks 1–3.
- Sem TBD. Assinaturas (`sendEmail`, `buildPaymentReceiptEmail`, `receiptEmailSentAt`) consistentes.
