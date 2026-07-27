import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { FoodRecallsService } from './food-recalls.service';
import { AuthContext } from '../auth/types/auth-context';

const FULL_TREE = {
  meals: {
    orderBy: { order: 'asc' },
    include: { items: { orderBy: { order: 'asc' } } },
  },
} as const;

function nutCtx(nutritionistId: string | null): AuthContext {
  return {
    authProviderId: 'sub-n',
    email: 'n@x.com',
    name: 'Nut',
    user: {
      id: 'user-n',
      role: 'NUTRITIONIST',
      nutritionistProfile: nutritionistId ? { id: nutritionistId } : null,
      patientProfile: null,
    } as any,
  };
}

describe('FoodRecallsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: FoodRecallsService;
  const ctx = nutCtx('n1');

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new FoodRecallsService(prisma);
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    prisma.food.findMany.mockResolvedValue([{ id: 'f1' }] as any);
  });

  describe('create', () => {
    it('creates the tree scoped to an owned patient (order by index, foodId persisted)', async () => {
      prisma.foodRecall.create.mockResolvedValue({ id: 'r1' } as any);

      await service.create(ctx, {
        patientId: 'p1',
        recallDate: '2026-07-22',
        meals: [
          {
            name: 'Café',
            items: [{ foodName: 'Ovos', foodId: 'f1', grams: 100, calories: 143 }],
          },
        ],
      } as any);

      expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', nutritionistId: 'n1' },
        select: { id: true },
      });
      expect(prisma.food.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['f1'] } },
        select: { id: true },
      });

      const arg = prisma.foodRecall.create.mock.calls[0][0] as any;
      expect(arg.data.patientId).toBe('p1');
      expect(arg.data.recallDate).toBe('2026-07-22');
      expect(arg.data.meals.create[0].name).toBe('Café');
      expect(arg.data.meals.create[0].order).toBe(0);
      expect(arg.data.meals.create[0].items.create[0]).toEqual(
        expect.objectContaining({ foodId: 'f1', grams: 100, calories: 143, order: 0 }),
      );
      expect(arg.include).toEqual(FULL_TREE);
    });

    it('creates a minimal { patientId } draft with no meals', async () => {
      prisma.foodRecall.create.mockResolvedValue({ id: 'r1' } as any);

      await service.create(ctx, { patientId: 'p1' } as any);

      expect(prisma.food.findMany).not.toHaveBeenCalled();
      expect(prisma.foodRecall.create).toHaveBeenCalledWith({
        data: { patientId: 'p1', meals: undefined },
        include: FULL_TREE,
      });
    });

    it('rejects an unknown foodId with 400 (creates nothing)', async () => {
      prisma.food.findMany.mockResolvedValue([]);

      await expect(
        service.create(ctx, {
          patientId: 'p1',
          meals: [{ items: [{ foodId: 'nope' }] }],
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.foodRecall.create).not.toHaveBeenCalled();
    });

    it('throws NotFound and does not create when the patient is not owned', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.create(ctx, { patientId: 'other' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.foodRecall.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('lists an owned patient recalls newest-first by recallDate', async () => {
      prisma.foodRecall.findMany.mockResolvedValue([{ id: 'r1' }] as any);

      const result = await service.list(ctx, 'p1');

      expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', nutritionistId: 'n1' },
        select: { id: true },
      });
      expect(prisma.foodRecall.findMany).toHaveBeenCalledWith({
        where: { patientId: 'p1' },
        orderBy: { recallDate: 'desc' },
      });
      expect(result).toEqual([{ id: 'r1' }]);
    });

    it('404s a non-owned patient', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);

      await expect(service.list(ctx, 'pX')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.foodRecall.findMany).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns the full ordered tree for an owned recall', async () => {
      prisma.foodRecall.findFirst.mockResolvedValue({ id: 'r1' } as any);

      const result = await service.get(ctx, 'r1');

      expect(prisma.foodRecall.findFirst).toHaveBeenCalledWith({
        where: { id: 'r1', patient: { nutritionistId: 'n1' } },
        include: FULL_TREE,
      });
      expect(result).toEqual({ id: 'r1' });
    });

    it('404s a non-owned recall', async () => {
      prisma.foodRecall.findFirst.mockResolvedValue(null);

      await expect(service.get(ctx, 'other')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('patches only top-level fields and leaves the tree untouched when meals is omitted', async () => {
      prisma.foodRecall.findFirst.mockResolvedValue({ id: 'r1' } as any);
      prisma.foodRecall.update.mockResolvedValue({ id: 'r1' } as any);

      const result = await service.update(ctx, 'r1', { notes: 'x' } as any);

      expect(prisma.foodRecall.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { notes: 'x' },
        include: FULL_TREE,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.recallMeal.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'r1' });
    });

    it('replaces the tree (deletes meals then recreates) for an owned recall', async () => {
      prisma.foodRecall.findFirst.mockResolvedValue({ id: 'r1', patientId: 'p1' } as any);
      prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
      prisma.recallMeal.deleteMany.mockResolvedValue({ count: 1 } as any);
      prisma.foodRecall.update.mockResolvedValue({ id: 'r1' } as any);

      await service.update(ctx, 'r1', {
        notes: 'x',
        meals: [{ name: 'Almoço', items: [] }],
      } as any);

      expect(prisma.recallMeal.deleteMany).toHaveBeenCalledWith({ where: { foodRecallId: 'r1' } });
      expect(prisma.foodRecall.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: {
          notes: 'x',
          meals: { create: [{ name: 'Almoço', timeLabel: undefined, order: 0, items: { create: [] } }] },
        },
        include: FULL_TREE,
      });
    });

    it('rejects an unknown foodId with 400 and does not write when replacing the tree', async () => {
      prisma.foodRecall.findFirst.mockResolvedValue({ id: 'r1' } as any);
      prisma.food.findMany.mockResolvedValue([]);

      await expect(
        service.update(ctx, 'r1', { meals: [{ items: [{ foodId: 'nope' }] }] } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.foodRecall.update).not.toHaveBeenCalled();
      expect(prisma.recallMeal.deleteMany).not.toHaveBeenCalled();
    });

    it('throws NotFound and does not write when the recall is not owned', async () => {
      prisma.foodRecall.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ctx, 'other', { notes: 'x' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.foodRecall.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes an owned recall (cascade removes meals/items)', async () => {
      prisma.foodRecall.findFirst.mockResolvedValue({ id: 'r1' } as any);
      prisma.foodRecall.delete.mockResolvedValue({ id: 'r1' } as any);

      const result = await service.delete(ctx, 'r1');

      expect(prisma.foodRecall.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
      expect(result).toEqual({ id: 'r1' });
    });

    it('throws NotFound and does not delete when the recall is not owned', async () => {
      prisma.foodRecall.findFirst.mockResolvedValue(null);

      await expect(service.delete(ctx, 'other')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.foodRecall.delete).not.toHaveBeenCalled();
    });
  });
});
