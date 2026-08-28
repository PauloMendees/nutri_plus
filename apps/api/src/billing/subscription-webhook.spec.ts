import { SubscriptionService } from './subscription.service';
import { planValue } from './prorata';

function svcWith(
  sub: any,
  opts?: { paymentRow?: any; resend?: any; config?: Record<string, string | undefined>; asaas?: any },
) {
  const paymentRow = opts?.paymentRow ?? { id: 'row_1', receiptEmailSentAt: null };
  const prisma = {
    subscription: { findFirst: jest.fn().mockResolvedValue(sub), update: jest.fn().mockResolvedValue({}) },
    subscriptionPayment: {
      upsert: jest.fn().mockResolvedValue(paymentRow),
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;
  const resend = opts?.resend ?? { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const cfg: Record<string, string | undefined> = {
    WEB_ORIGIN: 'https://app.test',
    SUPPORT_FROM_EMAIL: 'iNutri <suporte@inutri.life>',
    ...opts?.config,
  };
  const config = {
    get: (k: string) => cfg[k],
    getOrThrow: (k: string) => {
      const v = cfg[k];
      if (v == null) throw new Error(k);
      return v;
    },
  } as any;
  const asaas = opts?.asaas ?? {};
  return { prisma, resend, asaas, svc: new SubscriptionService(prisma, {} as any, asaas, resend, config) };
}

const nutri = { user: { name: 'Ana', email: 'ana@x.com' } };
const payment = { id: 'pay_1', subscription: 'sub_1', value: 49, status: 'CONFIRMED', billingType: 'PIX', dueDate: '2026-08-10', paymentDate: '2026-08-04' };

describe('SubscriptionService.handleWebhook', () => {
  it('PAYMENT_CONFIRMED → ACTIVE + upsert do pagamento (idempotente por asaasPaymentId)', async () => {
    const { svc, prisma } = svcWith({ id: 's1', billingPeriod: 'MONTHLY', status: 'TRIALING', plan: 'ESSENCIAL', nutritionist: nutri });
    await svc.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment });
    expect(prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }));
    expect(prisma.subscriptionPayment.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { asaasPaymentId: 'pay_1' } }));
  });

  it('PAYMENT_OVERDUE → PAST_DUE e não envia e-mail', async () => {
    const { svc, prisma, resend } = svcWith({ id: 's1', billingPeriod: 'MONTHLY', status: 'ACTIVE', nutritionist: nutri });
    await svc.handleWebhook({ event: 'PAYMENT_OVERDUE', payment: { ...payment, status: 'OVERDUE' } });
    expect(prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PAST_DUE' }) }));
    expect(resend.sendEmail).not.toHaveBeenCalled();
  });

  it('assinatura desconhecida → no-op (não explode)', async () => {
    const { svc, prisma } = svcWith(null);
    await svc.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment });
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('TRIALING + PAYMENT_CONFIRMED → e-mail de boas-vindas e marca receiptEmailSentAt', async () => {
    const { svc, prisma, resend } = svcWith({
      id: 's1', billingPeriod: 'MONTHLY', status: 'TRIALING', plan: 'PRO', nutritionist: nutri,
    });
    await svc.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment: { ...payment, value: 99 } });
    expect(resend.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ana@x.com',
      from: 'iNutri <suporte@inutri.life>',
      subject: expect.stringContaining('Bem-vindo'),
    }));
    expect(prisma.subscriptionPayment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'row_1' },
      data: expect.objectContaining({ receiptEmailSentAt: expect.any(Date) }),
    }));
  });

  it('já ACTIVE + PAYMENT_RECEIVED → e-mail de renovação', async () => {
    const { svc, resend } = svcWith({
      id: 's1', billingPeriod: 'MONTHLY', status: 'ACTIVE', plan: 'PRO', nutritionist: nutri,
    });
    await svc.handleWebhook({ event: 'PAYMENT_RECEIVED', payment });
    expect(resend.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringMatching(/Pagamento confirmado/),
    }));
    expect(resend.sendEmail.mock.calls[0][0].subject).not.toMatch(/Bem-vindo/);
  });

  it('não reenvia quando receiptEmailSentAt já está preenchido', async () => {
    const { svc, resend, prisma } = svcWith(
      { id: 's1', billingPeriod: 'MONTHLY', status: 'TRIALING', plan: 'ESSENCIAL', nutritionist: nutri },
      { paymentRow: { id: 'row_1', receiptEmailSentAt: new Date('2026-08-01') } },
    );
    await svc.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment });
    expect(resend.sendEmail).not.toHaveBeenCalled();
    expect(prisma.subscriptionPayment.update).not.toHaveBeenCalled();
  });

  it('falha do Resend não impede ACTIVE nem relança', async () => {
    const { svc, prisma } = svcWith(
      { id: 's1', billingPeriod: 'MONTHLY', status: 'TRIALING', plan: 'ESSENCIAL', nutritionist: nutri },
      { resend: { sendEmail: jest.fn().mockRejectedValue(new Error('resend down')) } },
    );
    await expect(svc.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment })).resolves.toBeUndefined();
    expect(prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }));
    expect(prisma.subscriptionPayment.update).not.toHaveBeenCalled();
  });

  it('webhook do diff (pendingChargeAsaasId) aplica o upgrade e limpa o pending', async () => {
    const { svc, prisma, asaas } = svcWith(
      {
        id: 's1', asaasSubscriptionId: 'sub_1', pendingPlan: 'PRO', pendingBillingPeriod: 'MONTHLY',
        pendingChargeAsaasId: 'pay_2', billingPeriod: 'MONTHLY',
      },
      { asaas: { updateSubscriptionValue: jest.fn().mockResolvedValue(undefined) } },
    );
    await svc.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_2', value: 25, status: 'CONFIRMED' } });
    // Derivado do catálogo: o teste é sobre o webhook promover o plano, não sobre o preço.
    expect(asaas.updateSubscriptionValue).toHaveBeenCalledWith('sub_1', { value: planValue('PRO', 'MONTHLY') });
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
      subscriptionPayment: { upsert: jest.fn().mockResolvedValue({ id: 'row_1', receiptEmailSentAt: null }) },
    } as any;
    const svc = new SubscriptionService(
      prisma,
      {} as any,
      {} as any,
      { sendEmail: jest.fn() } as any,
      { get: () => undefined, getOrThrow: (k: string) => k } as any,
    );
    await svc.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: 'cycle_1', subscription: 'sub_1', value: 49, status: 'CONFIRMED', dueDate: '2026-09-01' } });
    expect(prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ plan: 'ESSENCIAL', pendingPlan: null }) }));
  });
});
