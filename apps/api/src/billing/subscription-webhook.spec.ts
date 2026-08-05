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
});
