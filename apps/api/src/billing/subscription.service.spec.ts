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
    createPixSubscription: jest.fn().mockResolvedValue({ subscriptionId: 'sub_1', pixQrCode: { encodedImage: 'B64', payload: 'p' } }),
    createCardSubscription: jest.fn().mockResolvedValue({ subscriptionId: 'sub_2', status: 'ACTIVE', cardLast4: '1234', cardBrand: 'VISA' }),
    cancelSubscription: jest.fn().mockResolvedValue(undefined),
    updateSubscriptionBilling: jest.fn().mockResolvedValue({ cardLast4: null, cardBrand: null }),
  } as any;
  return { prisma, entitlements, asaas, svc: new SubscriptionService(prisma, entitlements, asaas) };
}

describe('SubscriptionService.checkout', () => {
  it('cria customer (quando não há) + assinatura Pix, guarda ids/plano e retorna o QR', async () => {
    const { svc, prisma, asaas } = deps({ id: 's1', nutritionistId: 'n1', asaasCustomerId: null, asaasSubscriptionId: null });
    const out = await svc.checkout('n1', { plan: 'ESSENCIAL', period: 'MONTHLY', cpfCnpj: '12345678901', method: 'PIX' }, { name: 'A', email: 'a@x.com' }, '1.2.3.4');
    expect(out).toEqual({ method: 'PIX', pixQrCode: { encodedImage: 'B64', payload: 'p' } });
    expect(asaas.ensureCustomer).toHaveBeenCalled();
    expect(asaas.createPixSubscription).toHaveBeenCalledWith(expect.objectContaining({ value: 49, cycle: 'MONTHLY', customerId: 'cus_1' }));
    expect(prisma.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ asaasSubscriptionId: 'sub_1', plan: 'ESSENCIAL', billingPeriod: 'MONTHLY' }),
    }));
  });

  it('reutiliza asaasCustomerId existente e cancela a assinatura anterior antes de trocar', async () => {
    const { svc, asaas } = deps({ id: 's1', nutritionistId: 'n1', asaasCustomerId: 'cus_9', asaasSubscriptionId: 'sub_old' });
    await svc.checkout('n1', { plan: 'PRO', period: 'YEARLY', cpfCnpj: '12345678901', method: 'PIX' }, { name: 'A', email: 'a@x.com' }, '1.2.3.4');
    expect(asaas.ensureCustomer).not.toHaveBeenCalled();
    expect(asaas.cancelSubscription).toHaveBeenCalledWith('sub_old');
    expect(asaas.createPixSubscription).toHaveBeenCalledWith(expect.objectContaining({ value: 990, cycle: 'YEARLY' }));
  });

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
});

describe('SubscriptionService.getView', () => {
  it('getView expõe onboardedAt/paymentMethod/cardLast4/cardBrand', async () => {
    const { svc } = deps({ id: 's1', nutritionistId: 'n1', status: 'ACTIVE', onboardedAt: new Date(), paymentMethod: 'CREDIT_CARD', cardLast4: '1234', cardBrand: 'VISA' });
    const view = await svc.getView('n1');
    expect(view).toMatchObject({ paymentMethod: 'CREDIT_CARD', cardLast4: '1234', cardBrand: 'VISA' });
    expect(view.onboardedAt).toEqual(expect.any(String));
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

describe('SubscriptionService.startTrial', () => {
  it('startTrial seta trialEndsAt (+7d) e onboardedAt, status TRIALING', async () => {
    const { svc, prisma } = deps({ id: 's1', nutritionistId: 'n1' });
    await svc.startTrial('n1');
    const data = prisma.subscription.update.mock.calls[0][0].data;
    const days = (data.trialEndsAt.getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(6.9); expect(days).toBeLessThan(7.1);
    expect(data).toMatchObject({ status: 'TRIALING', onboardedAt: expect.any(Date) });
  });
});

describe('SubscriptionService.updatePaymentMethod', () => {
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
});

const activeSub = (over: any = {}) => ({ id: 's1', nutritionistId: 'n1', status: 'ACTIVE', asaasSubscriptionId: 'sub_1', asaasCustomerId: 'cus_1', plan: 'ESSENCIAL', billingPeriod: 'MONTHLY', currentPeriodEnd: new Date(Date.now() + 15 * 86400000), paymentMethod: 'CREDIT_CARD', asaasCardToken: 'tok_1', ...over });

describe('SubscriptionService.changePlan', () => {
  it('changePlan upgrade no cartão cobra a diferença e aplica na hora (mantém vencimento)', async () => {
    const { svc, prisma, asaas } = deps(activeSub());
    asaas.createOneOffCharge = jest.fn().mockResolvedValue({ paymentId: 'pay_1', status: 'ACTIVE' });
    asaas.updateSubscriptionValue = jest.fn().mockResolvedValue(undefined);
    const out = await svc.changePlan('n1', { plan: 'PRO', period: 'MONTHLY' });
    expect(out).toMatchObject({ kind: 'UPGRADE', method: 'CREDIT_CARD', status: 'ACTIVE' });
    expect((out as any).amount).toBeGreaterThan(0); // ChangePlanResponse.SCHEDULED não tem `amount`; TS não estreita via toMatchObject
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
});
