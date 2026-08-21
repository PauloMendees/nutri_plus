import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { MealLogsService, MEAL_LOG_LOCK_MESSAGE } from './meal-logs.service';

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const CONSUMED_AT = '2026-08-20T12:00:00.000Z';

function ctxPatient(patientId: string): AuthContext {
  return {
    authProviderId: 'sub-p',
    email: 'p@x.com',
    name: 'Ana',
    user: {
      id: 'user-p',
      role: 'PATIENT',
      nutritionistProfile: null,
      patientProfile: { id: patientId },
      employeeProfile: null,
    } as any,
  };
}

function ctxNutri(nutritionistId: string): AuthContext {
  return {
    authProviderId: 'sub-n',
    email: 'n@x.com',
    name: 'Nut',
    user: {
      id: 'user-n',
      role: 'NUTRITIONIST',
      nutritionistProfile: { id: nutritionistId },
      patientProfile: null,
      employeeProfile: null,
    } as any,
  };
}

const planOption = {
  id: 'opt-1',
  label: 'Opção A',
  meal: { id: 'm1', name: 'Almoço', timeLabel: '12h', mealPlanId: 'plan-1' },
  items: [
    { foodName: 'Arroz', quantity: '100g', calories: 130, protein: 2, carbs: 28, fats: 0, grams: 100 },
  ],
};

const itemsJson = [
  { foodName: 'Arroz', quantity: '100g', calories: 130, protein: 2, carbs: 28, fats: 0, grams: 100 },
];

function row(overrides: Record<string, unknown> = {}) {
  const createdAt = (overrides.createdAt as Date) ?? new Date('2026-08-21T10:00:00.000Z');
  return {
    id: 'log-1',
    patientId: 'pp-1',
    consumedAt: new Date(CONSUMED_AT),
    source: 'FREE_TEXT' as const,
    note: null,
    freeText: 'Pizza',
    mealName: null,
    mealTimeLabel: null,
    optionLabel: null,
    itemsJson: null,
    mealPlanId: null,
    mealId: null,
    mealOptionId: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe('MealLogsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: MealLogsService;
  const ctx = ctxPatient('pp-1');
  const nutri = ctxNutri('nutri-1');

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new MealLogsService(prisma);
  });

  it('create PLAN snapshots the option on the latest visible plan and sets editableUntil', async () => {
    prisma.mealPlan.findFirst.mockResolvedValue({ id: 'plan-1' } as any);
    prisma.mealOption.findFirst.mockResolvedValue(planOption as any);
    const createdAt = new Date('2026-08-21T10:00:00.000Z');
    prisma.mealLog.create.mockResolvedValue(
      row({
        source: 'PLAN',
        freeText: null,
        mealName: 'Almoço',
        mealTimeLabel: '12h',
        optionLabel: 'Opção A',
        itemsJson,
        mealPlanId: 'plan-1',
        mealId: 'm1',
        mealOptionId: 'opt-1',
        createdAt,
        updatedAt: createdAt,
      }) as any,
    );

    const result = await service.create(ctx, {
      consumedAt: CONSUMED_AT,
      source: 'PLAN',
      mealOptionId: 'opt-1',
    });

    expect(prisma.mealPlan.findFirst).toHaveBeenCalledWith({
      where: { patientId: 'pp-1', visibleToPatient: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    expect(prisma.mealOption.findFirst).toHaveBeenCalledWith({
      where: { id: 'opt-1', meal: { mealPlanId: 'plan-1' } },
      include: { meal: true, items: { orderBy: { order: 'asc' } } },
    });
    expect(prisma.mealLog.create).toHaveBeenCalledWith({
      data: {
        patientId: 'pp-1',
        consumedAt: new Date(CONSUMED_AT),
        source: 'PLAN',
        note: null,
        freeText: null,
        mealName: 'Almoço',
        mealTimeLabel: '12h',
        optionLabel: 'Opção A',
        itemsJson,
        mealPlanId: 'plan-1',
        mealId: 'm1',
        mealOptionId: 'opt-1',
      },
    });
    expect(result.editableUntil).toBe(new Date(createdAt.getTime() + EDIT_WINDOW_MS).toISOString());
    expect(result.source).toBe('PLAN');
    expect(result.mealName).toBe('Almoço');
  });

  it('create PLAN when option is missing / not on latest plan throws BadRequestException', async () => {
    const dto = { consumedAt: CONSUMED_AT, source: 'PLAN' as const, mealOptionId: 'opt-missing' };

    prisma.mealPlan.findFirst.mockResolvedValue(null);
    await expect(service.create(ctx, dto)).rejects.toBeInstanceOf(BadRequestException);

    prisma.mealPlan.findFirst.mockResolvedValue({ id: 'plan-1' } as any);
    prisma.mealOption.findFirst.mockResolvedValue(null);
    await expect(service.create(ctx, dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.mealLog.create).not.toHaveBeenCalled();
  });

  it('create FREE_TEXT stores freeText and nulls snapshot + FKs', async () => {
    const createdAt = new Date('2026-08-21T10:00:00.000Z');
    prisma.mealLog.create.mockResolvedValue(row({ createdAt, updatedAt: createdAt }) as any);

    const result = await service.create(ctx, {
      consumedAt: CONSUMED_AT,
      source: 'FREE_TEXT',
      freeText: 'Pizza',
    });

    expect(prisma.mealPlan.findFirst).not.toHaveBeenCalled();
    expect(prisma.mealLog.create).toHaveBeenCalledWith({
      data: {
        patientId: 'pp-1',
        consumedAt: new Date(CONSUMED_AT),
        source: 'FREE_TEXT',
        note: null,
        freeText: 'Pizza',
        mealName: null,
        mealTimeLabel: null,
        optionLabel: null,
        itemsJson: Prisma.DbNull,
        mealPlanId: null,
        mealId: null,
        mealOptionId: null,
      },
    });
    expect(result.freeText).toBe('Pizza');
    expect(result.mealName).toBeNull();
    expect(result.editableUntil).toBe(new Date(createdAt.getTime() + EDIT_WINDOW_MS).toISOString());
  });

  it('create rejects consumedAt more than 5 minutes in the future', async () => {
    const future = new Date(Date.now() + 6 * 60 * 1000).toISOString();
    await expect(
      service.create(ctx, { consumedAt: future, source: 'FREE_TEXT', freeText: 'Pizza' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.mealLog.create).not.toHaveBeenCalled();
  });

  it('update succeeds when createdAt is 1h ago', async () => {
    const createdAt = new Date(Date.now() - 60 * 60 * 1000);
    prisma.mealLog.findFirst.mockResolvedValue(row({ createdAt }) as any);
    prisma.mealLog.update.mockResolvedValue(
      row({ createdAt, freeText: 'Salada', updatedAt: new Date() }) as any,
    );

    const result = await service.update(ctx, 'log-1', {
      consumedAt: CONSUMED_AT,
      source: 'FREE_TEXT',
      freeText: 'Salada',
    });

    expect(prisma.mealLog.update).toHaveBeenCalled();
    expect(result.freeText).toBe('Salada');
  });

  it('remove succeeds when createdAt is 1h ago', async () => {
    const createdAt = new Date(Date.now() - 60 * 60 * 1000);
    prisma.mealLog.findFirst.mockResolvedValue(row({ createdAt }) as any);
    prisma.mealLog.delete.mockResolvedValue(row({ createdAt }) as any);

    await service.remove(ctx, 'log-1');

    expect(prisma.mealLog.delete).toHaveBeenCalledWith({ where: { id: 'log-1' } });
  });

  it('update throws ForbiddenException with lock message when createdAt is 25h ago', async () => {
    prisma.mealLog.findFirst.mockResolvedValue(
      row({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }) as any,
    );

    await expect(
      service.update(ctx, 'log-1', {
        consumedAt: CONSUMED_AT,
        source: 'FREE_TEXT',
        freeText: 'Salada',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update(ctx, 'log-1', {
        consumedAt: CONSUMED_AT,
        source: 'FREE_TEXT',
        freeText: 'Salada',
      }),
    ).rejects.toThrow(MEAL_LOG_LOCK_MESSAGE);
    expect(prisma.mealLog.update).not.toHaveBeenCalled();
  });

  it('remove throws ForbiddenException with lock message when createdAt is 25h ago', async () => {
    prisma.mealLog.findFirst.mockResolvedValue(
      row({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }) as any,
    );

    await expect(service.remove(ctx, 'log-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(ctx, 'log-1')).rejects.toThrow(MEAL_LOG_LOCK_MESSAGE);
    expect(prisma.mealLog.delete).not.toHaveBeenCalled();
  });

  it('update unknown id throws NotFoundException', async () => {
    prisma.mealLog.findFirst.mockResolvedValue(null);
    await expect(
      service.update(ctx, 'missing', {
        consumedAt: CONSUMED_AT,
        source: 'FREE_TEXT',
        freeText: 'Pizza',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove unknown id throws NotFoundException', async () => {
    prisma.mealLog.findFirst.mockResolvedValue(null);
    await expect(service.remove(ctx, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listMine without query bounds consumedAt gte ~now-30d ordered desc', async () => {
    prisma.mealLog.findMany.mockResolvedValue([]);
    const before = Date.now();
    await service.listMine(ctx, {});
    const after = Date.now();

    expect(prisma.mealLog.findMany).toHaveBeenCalledWith({
      where: {
        patientId: 'pp-1',
        consumedAt: { gte: expect.any(Date), lte: expect.any(Date) },
      },
      orderBy: { consumedAt: 'desc' },
    });
    const arg = prisma.mealLog.findMany.mock.calls[0][0] as {
      where: { consumedAt: { gte: Date; lte: Date } };
    };
    const expectedGte = 30 * 24 * 60 * 60 * 1000;
    expect(arg.where.consumedAt.gte.getTime()).toBeGreaterThanOrEqual(before - expectedGte);
    expect(arg.where.consumedAt.gte.getTime()).toBeLessThanOrEqual(after - expectedGte);
  });

  it('listMine all: true has no consumedAt gte bound', async () => {
    prisma.mealLog.findMany.mockResolvedValue([]);
    await service.listMine(ctx, { all: true });

    const arg = prisma.mealLog.findMany.mock.calls[0][0] as {
      where: { patientId: string; consumedAt: { gte?: Date; lte: Date } };
      orderBy: { consumedAt: string };
    };
    expect(arg.where.patientId).toBe('pp-1');
    expect(arg.where.consumedAt.gte).toBeUndefined();
    expect(arg.where.consumedAt.lte).toBeInstanceOf(Date);
    expect(arg.orderBy).toEqual({ consumedAt: 'desc' });
  });

  it('listForPatient finds owned patient logs', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'pp-1' } as any);
    prisma.mealLog.findMany.mockResolvedValue([]);

    await service.listForPatient(nutri, 'pp-1', {});

    expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'pp-1', nutritionistId: 'nutri-1' },
    });
    expect(prisma.mealLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ patientId: 'pp-1' }),
        orderBy: { consumedAt: 'desc' },
      }),
    );
  });

  it('listForPatient throws NotFoundException for a foreign patient', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(null);
    await expect(service.listForPatient(nutri, 'foreign', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.mealLog.findMany).not.toHaveBeenCalled();
  });
});
