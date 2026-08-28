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
      startedAt: new Date(Date.now() - 11 * 60_000),
    });
    await expect(stuck.svc.retry(ctx, 'j1')).resolves.toEqual({ jobId: 'j1' });
  });

  it('job de outro nutricionista responde 404', async () => {
    const { svc } = deps();
    await expect(svc.retry(ctx, 'j1')).rejects.toThrow(NotFoundException);
  });
});
