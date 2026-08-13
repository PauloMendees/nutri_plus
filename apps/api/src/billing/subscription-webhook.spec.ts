import { SubscriptionService } from './subscription.service';

function svcWith(
  sub: any,
  opts?: { paymentRow?: any; resend?: any; config?: Record<string, string | undefined> },
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
  return { prisma, resend, svc: new SubscriptionService(prisma, {} as any, {} as any, resend, config) };
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
});
