import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { AiJobsController } from './ai-jobs.controller';
import { MealGenerationController } from '../meal-generation/meal-generation.controller';

const ctx = {
  authProviderId: 'auth-1', email: 'nutri@x.com', name: 'Nutri',
  user: { id: 'u1', role: 'NUTRITIONIST', nutritionistProfile: { id: 'n1' }, patientProfile: null, employeeProfile: null },
} as never;

function deps() {
  const jobs = {
    get: jest.fn().mockResolvedValue({ id: 'j1', status: 'DONE' }),
    listForPatient: jest.fn().mockResolvedValue([]),
    retry: jest.fn().mockResolvedValue({ jobId: 'j1' }),
    markConsumed: jest.fn().mockResolvedValue(undefined),
  };
  return { ctrl: new AiJobsController(jobs as never), jobs };
}

describe('AiJobsController', () => {
  it('lista por paciente', async () => {
    const { ctrl, jobs } = deps();
    await ctrl.list(ctx, { patientId: 'p1' });
    expect(jobs.listForPatient).toHaveBeenCalledWith(ctx, 'p1');
  });

  it('busca um job', async () => {
    const { ctrl, jobs } = deps();
    await ctrl.get(ctx, 'j1');
    expect(jobs.get).toHaveBeenCalledWith(ctx, 'j1');
  });

  it('repete um job', async () => {
    const { ctrl, jobs } = deps();
    expect(await ctrl.retry(ctx, 'j1')).toEqual({ jobId: 'j1' });
    expect(jobs.retry).toHaveBeenCalledWith(ctx, 'j1');
  });

  it('marca o rascunho como consumido', async () => {
    const { ctrl, jobs } = deps();
    await ctrl.consume(ctx, 'j1');
    expect(jobs.markConsumed).toHaveBeenCalledWith(ctx, 'j1');
  });
});

describe('MealGenerationController — os dois POST criam job (e portanto passam pela cota)', () => {
  function ctrl() {
    const jobs = {
      create: jest.fn().mockResolvedValue({ jobId: 'j1' }),
      createForPlan: jest.fn().mockResolvedValue({ jobId: 'j2' }),
    };
    return { c: new MealGenerationController(jobs as never), jobs };
  }

  it('generate-meal-plan delega ao AiJobsService, nunca ao MealGenerationService', async () => {
    const { c, jobs } = ctrl();
    expect(await c.generateMealPlan(ctx, { patientId: 'p1', instructions: 'x' } as never))
      .toEqual({ jobId: 'j1' });
    expect(jobs.create).toHaveBeenCalledWith(ctx, expect.objectContaining({
      type: 'MEAL_PLAN_GENERATION', patientId: 'p1',
    }));
  });

  it('adjust-meal-plan delega ao AiJobsService', async () => {
    const { c, jobs } = ctrl();
    expect(await c.adjustMealPlan(ctx, { planId: 'm1', instructions: 'y' } as never))
      .toEqual({ jobId: 'j2' });
    expect(jobs.createForPlan).toHaveBeenCalledWith(ctx, 'm1', 'y');
  });

  it('os dois POST respondem 202, contrato que a ordem de deploy depende', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, MealGenerationController.prototype.generateMealPlan)).toBe(202);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, MealGenerationController.prototype.adjustMealPlan)).toBe(202);
  });
});
