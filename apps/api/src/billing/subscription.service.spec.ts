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
