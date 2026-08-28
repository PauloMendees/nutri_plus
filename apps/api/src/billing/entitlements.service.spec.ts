import { EntitlementsService } from './entitlements.service';
import { PaymentRequiredException } from './payment-required.exception';

const HOUR = 3600_000;
function futureDate(days: number) { return new Date(Date.now() + days * 24 * HOUR); }
function pastDate(days: number) { return new Date(Date.now() - days * 24 * HOUR); }

// Prisma mockado: subscription.findUnique, aIInteraction.count, aiJob.count, employeeProfile.count
function makePrisma(overrides: Partial<{ sub: any; aiCount: number; empCount: number; activeJobCount: number }> = {}) {
  return {
    subscription: { findUnique: jest.fn().mockResolvedValue(overrides.sub ?? null) },
    aIInteraction: { count: jest.fn().mockResolvedValue(overrides.aiCount ?? 0) },
    aiJob: { count: jest.fn().mockResolvedValue(overrides.activeJobCount ?? 0) },
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

function svc(interactionCount: number, activeJobCount: number) {
  const prisma = {
    subscription: {
      findUnique: jest.fn().mockResolvedValue({
        status: 'ACTIVE', plan: 'ESSENCIAL', isComp: false, trialEndsAt: null,
      }),
    },
    aIInteraction: { count: jest.fn().mockResolvedValue(interactionCount) },
    aiJob: { count: jest.fn().mockResolvedValue(activeJobCount) },
    employeeProfile: { count: jest.fn().mockResolvedValue(0) },
  };
  return { service: new EntitlementsService(prisma as never), prisma };
}

describe('EntitlementsService.assertAiActionQuota', () => {
  // ESSENCIAL = 30 ações/mês.
  it('soma jobs ativos às interações bem-sucedidas', async () => {
    const { service } = svc(28, 2);
    await expect(service.assertAiActionQuota('n1')).rejects.toThrow(PaymentRequiredException);
  });

  it('passa quando a soma ainda cabe na cota', async () => {
    const { service } = svc(28, 1);
    await expect(service.assertAiActionQuota('n1')).resolves.toBeUndefined();
  });

  it('conta só PENDING e RUNNING, dentro do mês', async () => {
    const { service, prisma } = svc(0, 0);
    await service.assertAiActionQuota('n1');
    const where = prisma.aiJob.count.mock.calls[0][0].where;
    expect(where.nutritionistId).toBe('n1');
    expect(where.status).toEqual({ in: ['PENDING', 'RUNNING'] });
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });
});
