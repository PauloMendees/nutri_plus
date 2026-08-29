import { ConflictException, NotFoundException } from '@nestjs/common';
import { AiJobsService } from './ai-jobs.service';

// AuthContext real: { authProviderId, email, name, user }. O id do nutricionista
// sai de user.nutritionistProfile.id via resolveScopeNutritionistId.
const ctx = {
  authProviderId: 'auth-1',
  email: 'nutri@x.com',
  name: 'Nutri',
  user: {
    id: 'u1',
    role: 'NUTRITIONIST',
    nutritionistProfile: { id: 'n1' },
    patientProfile: null,
    employeeProfile: null,
  },
} as never;

function deps(job?: Record<string, unknown>) {
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'u1', authProviderId: 'auth-1', email: 'nutri@x.com', name: 'Nutri',
        role: 'NUTRITIONIST',
        nutritionistProfile: { id: 'n1' }, patientProfile: null, employeeProfile: null,
      }),
    },
    aiJob: {
      create: jest.fn().mockResolvedValue({ id: 'j1' }),
      findFirst: jest.fn().mockResolvedValue(job ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      // Claim atômico do runJob: por padrão vence a corrida (count: 1); os
      // testes de reentrância sobrescrevem para { count: 0 }.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    patientProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
    mealPlan: { findFirst: jest.fn().mockResolvedValue({ id: 'm1', patientId: 'p1' }) },
  };
  const entitlements = { assertAiActionQuota: jest.fn().mockResolvedValue(undefined) };
  const generation = {
    generate: jest.fn().mockResolvedValue({ id: 'plan1' }),
    adjust: jest.fn().mockResolvedValue({ title: 'rascunho' }),
  };
  const svc = new AiJobsService(prisma as never, entitlements as never, generation as never);
  return { svc, prisma, entitlements, generation };
}

describe('AiJobsService.create', () => {
  it('verifica a cota antes de gravar o job', async () => {
    const { svc, entitlements, prisma } = deps();
    await svc.create(ctx, { type: 'MEAL_PLAN_GENERATION', patientId: 'p1' });
    expect(entitlements.assertAiActionQuota).toHaveBeenCalledWith('n1');
    expect(prisma.aiJob.create).toHaveBeenCalled();
  });

  it('não grava job quando a cota estourou', async () => {
    const { svc, entitlements, prisma } = deps();
    entitlements.assertAiActionQuota.mockRejectedValue(new Error('AI_QUOTA_EXCEEDED'));
    await expect(svc.create(ctx, { type: 'MEAL_PLAN_GENERATION', patientId: 'p1' })).rejects.toThrow();
    expect(prisma.aiJob.create).not.toHaveBeenCalled();
  });

  it('createForPlan grava mealPlanId igual ao planId — é o que a faixa do editor usa para saber a qual plano o ajuste pertence', async () => {
    const { svc, prisma } = deps();
    await svc.createForPlan(ctx, 'm1', 'menos carbo');
    expect(prisma.aiJob.create.mock.calls[0][0].data).toMatchObject({ mealPlanId: 'm1' });
  });

  it('patientId de outro nutricionista (ou inexistente) responde 404 e não grava job', async () => {
    const { svc, prisma } = deps();
    prisma.patientProfile.findFirst.mockResolvedValue(null);
    await expect(
      svc.create(ctx, { type: 'MEAL_PLAN_GENERATION', patientId: 'other-nutri-patient' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.aiJob.create).not.toHaveBeenCalled();
  });
});

describe('AiJobsService.runJob', () => {
  it('geração grava DONE com mealPlanId', async () => {
    const { svc, prisma, generation } = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'PENDING',
      nutritionistId: 'n1', patientId: 'p1', input: {},
    });
    await svc.runJob('j1');
    expect(generation.generate).toHaveBeenCalled();
    const last = prisma.aiJob.update.mock.calls.at(-1)![0];
    expect(last.data).toMatchObject({ status: 'DONE', mealPlanId: 'plan1' });
  });

  it('ajuste grava DONE com o rascunho em result', async () => {
    const { svc, prisma, generation } = deps({
      id: 'j1', type: 'MEAL_PLAN_ADJUSTMENT', status: 'PENDING',
      nutritionistId: 'n1', patientId: 'p1', input: { planId: 'm1', instructions: 'menos carbo' },
    });
    await svc.runJob('j1');
    expect(generation.adjust).toHaveBeenCalledWith(expect.anything(), 'm1', 'menos carbo');
    const last = prisma.aiJob.update.mock.calls.at(-1)![0];
    expect(last.data).toMatchObject({ status: 'DONE' });
    expect(last.data.result).toEqual({ title: 'rascunho' });
  });

  it('falha grava FAILED com a mensagem', async () => {
    const { svc, prisma, generation } = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'PENDING',
      nutritionistId: 'n1', patientId: 'p1', input: {},
    });
    generation.generate.mockRejectedValue(new Error('AI provider unavailable'));
    await svc.runJob('j1');
    const last = prisma.aiJob.update.mock.calls.at(-1)![0];
    expect(last.data.status).toBe('FAILED');
    expect(last.data.error).toContain('AI provider unavailable');
  });

  it('não executa quando o claim atômico perde a corrida (reentrância)', async () => {
    const { svc, prisma, generation } = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'PENDING',
      nutritionistId: 'n1', patientId: 'p1', input: {},
    });
    prisma.aiJob.updateMany.mockResolvedValue({ count: 0 });
    await svc.runJob('j1');
    expect(generation.generate).not.toHaveBeenCalled();
    expect(prisma.aiJob.findFirst).not.toHaveBeenCalled();
  });
});

describe('AiJobsService.retry', () => {
  it('aceita job FAILED e volta para PENDING', async () => {
    const { svc, prisma } = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'FAILED',
      nutritionistId: 'n1', patientId: 'p1', input: {}, startedAt: new Date(),
    });
    await svc.retry(ctx, 'j1');
    expect(prisma.aiJob.update.mock.calls[0][0].data).toMatchObject({
      status: 'PENDING', error: null, startedAt: null, finishedAt: null,
    });
  });

  it('recusa job DONE', async () => {
    const { svc } = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'DONE',
      nutritionistId: 'n1', patientId: 'p1', input: {},
    });
    await expect(svc.retry(ctx, 'j1')).rejects.toThrow(ConflictException);
  });

  it('recusa RUNNING recente e aceita RUNNING travado', async () => {
    const recent = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'RUNNING',
      nutritionistId: 'n1', patientId: 'p1', input: {}, startedAt: new Date(),
    });
    await expect(recent.svc.retry(ctx, 'j1')).rejects.toThrow(ConflictException);

    const stuck = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'RUNNING',
      nutritionistId: 'n1', patientId: 'p1', input: {},
      startedAt: new Date(Date.now() - 36 * 60_000),
    });
    await expect(stuck.svc.retry(ctx, 'j1')).resolves.toEqual({ jobId: 'j1' });
  });

  it('recusa PENDING recente e aceita PENDING órfão (processo morreu antes de rodar)', async () => {
    const recent = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'PENDING',
      nutritionistId: 'n1', patientId: 'p1', input: {}, createdAt: new Date(),
    });
    await expect(recent.svc.retry(ctx, 'j1')).rejects.toThrow(ConflictException);

    const orphan = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'PENDING',
      nutritionistId: 'n1', patientId: 'p1', input: {},
      createdAt: new Date(Date.now() - 36 * 60_000),
    });
    await expect(orphan.svc.retry(ctx, 'j1')).resolves.toEqual({ jobId: 'j1' });
  });

  it('job de outro nutricionista responde 404', async () => {
    const { svc } = deps();
    await expect(svc.retry(ctx, 'j1')).rejects.toThrow(NotFoundException);
  });

  it('retry de FAILED com cota estourada rejeita e não grava (FAILED não conta na cota, então precisa ser checado de novo)', async () => {
    const { svc, entitlements, prisma } = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'FAILED',
      nutritionistId: 'n1', patientId: 'p1', input: {}, startedAt: new Date(),
    });
    entitlements.assertAiActionQuota.mockRejectedValue(new Error('AI_QUOTA_EXCEEDED'));
    await expect(svc.retry(ctx, 'j1')).rejects.toThrow();
    expect(prisma.aiJob.update).not.toHaveBeenCalled();
  });

  it('retry de RUNNING travado passa mesmo com a cota no limite — o job já conta, checar de novo o rejeitaria a si mesmo', async () => {
    const { svc, entitlements, prisma } = deps({
      id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'RUNNING',
      nutritionistId: 'n1', patientId: 'p1', input: {},
      startedAt: new Date(Date.now() - 36 * 60_000),
    });
    entitlements.assertAiActionQuota.mockRejectedValue(new Error('AI_QUOTA_EXCEEDED'));
    await expect(svc.retry(ctx, 'j1')).resolves.toEqual({ jobId: 'j1' });
    expect(entitlements.assertAiActionQuota).not.toHaveBeenCalled();
    expect(prisma.aiJob.update).toHaveBeenCalled();
  });
});

describe('AiJobsService.list (toView)', () => {
  it('traz o nome do paciente, que o widget global usa para distinguir os processos', async () => {
    const { svc, prisma } = deps();
    prisma.aiJob.findMany.mockResolvedValue([
      {
        id: 'j1', type: 'MEAL_PLAN_GENERATION', status: 'RUNNING', patientId: 'p1',
        mealPlanId: null, error: null, createdAt: new Date(), startedAt: new Date(), finishedAt: null,
        patient: { user: { name: 'Maria Silva' } },
      },
    ]);

    const views = await svc.list(ctx, 'p1');

    expect(views[0].patientName).toBe('Maria Silva');
    const select = prisma.aiJob.findMany.mock.calls[0][0].select;
    // O join do nome precisa existir, senão chega vazio em produção.
    expect(select.patient).toEqual({ select: { user: { select: { name: true } } } });
    // E `result` NÃO pode ser trazido: é o rascunho inteiro do plano, relido a
    // cada tick de 2s do polling enquanto um ajuste espera revisão.
    expect(select.result).toBeUndefined();
    expect(select.input).toBeUndefined();
  });

  it('sem patientId, não filtra por paciente — é o que o widget global consome', async () => {
    const { svc, prisma } = deps();
    prisma.aiJob.findMany.mockResolvedValue([]);

    await svc.list(ctx);

    const where = prisma.aiJob.findMany.mock.calls[0][0].where;
    expect(where.nutritionistId).toBe('n1');
    expect(where).not.toHaveProperty('patientId');
  });

  it('deriva isStuck por job e serializa datas como ISO string', async () => {
    const now = new Date();
    const stuckStartedAt = new Date(now.getTime() - 36 * 60_000);
    const okStartedAt = new Date(now.getTime() - 2 * 60_000);
    const { svc, prisma } = deps();
    prisma.aiJob.findMany.mockResolvedValue([
      {
        id: 'j-stuck', type: 'MEAL_PLAN_GENERATION', status: 'RUNNING', patientId: 'p1',
        mealPlanId: null, error: null, createdAt: now, startedAt: stuckStartedAt, finishedAt: null,
      },
      {
        id: 'j-ok', type: 'MEAL_PLAN_GENERATION', status: 'RUNNING', patientId: 'p1',
        mealPlanId: null, error: null, createdAt: now, startedAt: okStartedAt, finishedAt: null,
      },
    ]);

    const views = await svc.list(ctx, 'p1');

    expect(views[0]).toMatchObject({ id: 'j-stuck', isStuck: true });
    expect(views[1]).toMatchObject({ id: 'j-ok', isStuck: false });
    expect(typeof views[0].createdAt).toBe('string');
    expect(views[0].createdAt).toBe(now.toISOString());
    expect(views[0].startedAt).toBe(stuckStartedAt.toISOString());
    expect(views[1].startedAt).toBe(okStartedAt.toISOString());
  });
});

describe('AiJobsService.get', () => {
  it('job de outro nutricionista responde 404', async () => {
    const { svc } = deps();
    await expect(svc.get(ctx, 'j1')).rejects.toThrow(NotFoundException);
  });
});

describe('AiJobsService.markConsumed', () => {
  it('job de outro nutricionista responde 404', async () => {
    const { svc } = deps();
    await expect(svc.markConsumed(ctx, 'j1')).rejects.toThrow(NotFoundException);
  });
});
