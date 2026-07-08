import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { MealPlansService } from './meal-plans.service';
import { AuthContext } from '../auth/types/auth-context';

const FULL_TREE = {
  meals: {
    orderBy: { order: 'asc' },
    include: {
      options: {
        orderBy: { order: 'asc' },
        include: { items: { orderBy: { order: 'asc' } } },
      },
    },
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

function patCtx(patientProfileId: string | null): AuthContext {
  return {
    authProviderId: 'sub-p',
    email: 'p@x.com',
    name: 'Pat',
    user: {
      id: 'user-p',
      role: 'PATIENT',
      nutritionistProfile: null,
      patientProfile: patientProfileId ? { id: patientProfileId } : null,
    } as any,
  };
}

function empCtx(nutritionistId: string): AuthContext {
  return {
    authProviderId: 'sub-e',
    email: 'e@x.com',
    name: 'Emp',
    user: {
      id: 'user-e',
      role: 'EMPLOYEE',
      nutritionistProfile: null,
      patientProfile: null,
      employeeProfile: { nutritionistId },
    } as any,
  };
}

describe('MealPlansService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: MealPlansService;
  const ctx = nutCtx('nutri-1');

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new MealPlansService(prisma);
  });

  describe('createPlan', () => {
    it('verifies patient ownership then creates the nested tree with server-assigned order', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      prisma.mealPlan.create.mockResolvedValue({ id: 'mp1' } as any);

      const dto = {
        patientId: 'p1',
        title: 'Plan',
        meals: [
          { name: 'Breakfast', options: [{ label: 'Opção 1', items: [{ foodName: 'Egg', quantity: '2' }] }] },
        ],
      } as any;
      const result = await service.createPlan(ctx, dto);

      expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', nutritionistId: 'nutri-1' },
        select: { id: true },
      });
      expect(prisma.mealPlan.create).toHaveBeenCalledWith({
        data: {
          title: 'Plan',
          patientId: 'p1',
          meals: {
            create: [
              {
                name: 'Breakfast',
                timeLabel: undefined,
                instructions: undefined,
                order: 0,
                options: {
                  create: [
                    {
                      label: 'Opção 1',
                      order: 0,
                      items: { create: [{ foodName: 'Egg', quantity: '2', order: 0 }] },
                    },
                  ],
                },
              },
            ],
          },
        },
        include: FULL_TREE,
      });
      expect(result).toEqual({ id: 'mp1' });
    });

    it('creates a minimal { patientId } draft with no meals', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      prisma.mealPlan.create.mockResolvedValue({ id: 'mp1' } as any);

      await service.createPlan(ctx, { patientId: 'p1' } as any);

      expect(prisma.mealPlan.create).toHaveBeenCalledWith({
        data: { patientId: 'p1' },
        include: FULL_TREE,
      });
    });

    it('throws NotFound and does not create when the patient is not owned', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.createPlan(ctx, { patientId: 'other' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.mealPlan.create).not.toHaveBeenCalled();
    });

    it('throws Forbidden when the caller has no nutritionist profile', async () => {
      await expect(
        service.createPlan(nutCtx(null), { patientId: 'p1' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.patientProfile.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('listPlans', () => {
    it('lists an owned patient plans newest-first (summary, no items)', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      prisma.mealPlan.findMany.mockResolvedValue([{ id: 'mp1' }] as any);

      const result = await service.listPlans(ctx, 'p1');

      expect(prisma.mealPlan.findMany).toHaveBeenCalledWith({
        where: { patientId: 'p1', patient: { nutritionistId: 'nutri-1' } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([{ id: 'mp1' }]);
    });

    it('throws NotFound when the patient is not owned', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);

      await expect(service.listPlans(ctx, 'other')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.mealPlan.findMany).not.toHaveBeenCalled();
    });

    it('scopes an employee to the owning nutritionist when listing plans', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'pat-1' } as any);
      prisma.mealPlan.findMany.mockResolvedValue([] as any);

      await service.listPlans(empCtx('nutri-9'), 'pat-1');

      expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
        where: { id: 'pat-1', nutritionistId: 'nutri-9' },
        select: { id: true },
      });
      expect(prisma.mealPlan.findMany).toHaveBeenCalledWith({
        where: { patientId: 'pat-1', patient: { nutritionistId: 'nutri-9' } },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getPlan', () => {
    it('returns the full ordered tree for an owned plan', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue({ id: 'mp1' } as any);

      const result = await service.getPlan(ctx, 'mp1');

      expect(prisma.mealPlan.findFirst).toHaveBeenCalledWith({
        where: { id: 'mp1', patient: { nutritionistId: 'nutri-1' } },
        include: FULL_TREE,
      });
      expect(result).toEqual({ id: 'mp1' });
    });

    it('throws NotFound for a non-owned plan', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue(null);

      await expect(service.getPlan(ctx, 'other')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updatePlan', () => {
    it('patches only top-level fields and leaves the tree untouched when meals is omitted', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue({ id: 'mp1' } as any);
      prisma.mealPlan.update.mockResolvedValue({ id: 'mp1' } as any);

      const result = await service.updatePlan(ctx, 'mp1', { title: 'New' } as any);

      expect(prisma.mealPlan.update).toHaveBeenCalledWith({
        where: { id: 'mp1' },
        data: { title: 'New' },
        include: FULL_TREE,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.meal.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'mp1' });
    });

    it('replaces the whole tree in a transaction when meals is present', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue({ id: 'mp1' } as any);
      // Run the transaction callback against the same mock.
      prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
      prisma.meal.deleteMany.mockResolvedValue({ count: 1 } as any);
      prisma.mealPlan.update.mockResolvedValue({ id: 'mp1' } as any);

      const dto = {
        title: 'New',
        meals: [{ name: 'Lunch', options: [{ label: 'Opção 1', items: [{ foodName: 'Rice', quantity: '100g' }] }] }],
      } as any;
      await service.updatePlan(ctx, 'mp1', dto);

      expect(prisma.meal.deleteMany).toHaveBeenCalledWith({
        where: { mealPlanId: 'mp1' },
      });
      expect(prisma.mealPlan.update).toHaveBeenCalledWith({
        where: { id: 'mp1' },
        data: {
          title: 'New',
          meals: {
            create: [
              {
                name: 'Lunch',
                timeLabel: undefined,
                instructions: undefined,
                order: 0,
                options: {
                  create: [
                    {
                      label: 'Opção 1',
                      order: 0,
                      items: { create: [{ foodName: 'Rice', quantity: '100g', order: 0 }] },
                    },
                  ],
                },
              },
            ],
          },
        },
        include: FULL_TREE,
      });
    });

    it('clears the whole tree when meals is an empty array', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue({ id: 'mp1' } as any);
      prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
      prisma.meal.deleteMany.mockResolvedValue({ count: 2 } as any);
      prisma.mealPlan.update.mockResolvedValue({ id: 'mp1' } as any);

      await service.updatePlan(ctx, 'mp1', { meals: [] } as any);

      expect(prisma.meal.deleteMany).toHaveBeenCalledWith({
        where: { mealPlanId: 'mp1' },
      });
      expect(prisma.mealPlan.update).toHaveBeenCalledWith({
        where: { id: 'mp1' },
        data: { meals: { create: [] } },
        include: FULL_TREE,
      });
    });

    it('throws NotFound and does not write when the plan is not owned', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.updatePlan(ctx, 'other', { title: 'x' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.mealPlan.update).not.toHaveBeenCalled();
    });
  });

  describe('deletePlan', () => {
    it('deletes an owned plan (cascade removes meals/items)', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue({ id: 'mp1' } as any);
      prisma.mealPlan.delete.mockResolvedValue({ id: 'mp1' } as any);

      const result = await service.deletePlan(ctx, 'mp1');

      expect(prisma.mealPlan.delete).toHaveBeenCalledWith({ where: { id: 'mp1' } });
      expect(result).toEqual({ id: 'mp1' });
    });

    it('throws NotFound and does not delete when the plan is not owned', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue(null);

      await expect(service.deletePlan(ctx, 'other')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.mealPlan.delete).not.toHaveBeenCalled();
    });
  });

  describe('createGeneratedPlan', () => {
    it('verifies ownership and creates an aiGenerated plan with targets and ordered tree', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      prisma.mealPlan.create.mockResolvedValue({ id: 'mp1' } as any);

      const result = await service.createGeneratedPlan(ctx, {
        patientId: 'p1',
        title: 'AI Plan',
        targets: { calories: 2000, protein: 150, carbs: 200, fats: 56 },
        meals: [
          {
            name: 'Breakfast',
            timeLabel: '08:00',
            options: [
              { label: 'Opção 1', items: [{ foodName: 'Egg', quantity: '2', calories: 140, protein: 12, carbs: 1, fats: 9 }] },
            ],
          },
        ],
      });

      expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', nutritionistId: 'nutri-1' },
        select: { id: true },
      });
      expect(prisma.mealPlan.create).toHaveBeenCalledWith({
        data: {
          patientId: 'p1',
          title: 'AI Plan',
          aiGenerated: true,
          targetCalories: 2000,
          targetProtein: 150,
          targetCarbs: 200,
          targetFats: 56,
          meals: {
            create: [
              {
                name: 'Breakfast',
                timeLabel: '08:00',
                instructions: undefined,
                order: 0,
                options: {
                  create: [
                    {
                      label: 'Opção 1',
                      order: 0,
                      items: { create: [{ foodName: 'Egg', quantity: '2', calories: 140, protein: 12, carbs: 1, fats: 9, order: 0 }] },
                    },
                  ],
                },
              },
            ],
          },
        },
        include: FULL_TREE,
      });
      expect(result).toEqual({ id: 'mp1' });
    });

    it('throws NotFound and does not create when the patient is not owned', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.createGeneratedPlan(ctx, {
          patientId: 'other',
          targets: { calories: 1, protein: 1, carbs: 1, fats: 1 },
          meals: [],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.mealPlan.create).not.toHaveBeenCalled();
    });
  });

  describe('patient read', () => {
    const pctx = patCtx('pp1');

    it('lists the patient own plans newest-first', async () => {
      prisma.mealPlan.findMany.mockResolvedValue([{ id: 'mp1' }] as any);

      const result = await service.listMyPlans(pctx);

      expect(prisma.mealPlan.findMany).toHaveBeenCalledWith({
        where: { patientId: 'pp1', visibleToPatient: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([{ id: 'mp1' }]);
    });

    it('returns one own plan with the full tree', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue({ id: 'mp1' } as any);

      const result = await service.getMyPlan(pctx, 'mp1');

      expect(prisma.mealPlan.findFirst).toHaveBeenCalledWith({
        where: { id: 'mp1', patientId: 'pp1', visibleToPatient: true },
        include: FULL_TREE,
      });
      expect(result).toEqual({ id: 'mp1' });
    });

    it('throws NotFound when the plan is not the patient own', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue(null);

      await expect(service.getMyPlan(pctx, 'other')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws Forbidden when the caller has no patient profile', async () => {
      await expect(service.listMyPlans(patCtx(null))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('patient visibility', () => {
    it('listMyPlans filters to visible plans only', async () => {
      prisma.mealPlan.findMany.mockResolvedValue([] as any);
      await service.listMyPlans(patCtx('pp-1'));
      expect(prisma.mealPlan.findMany).toHaveBeenCalledWith({
        where: { patientId: 'pp-1', visibleToPatient: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('getMyPlan requires the plan to be visible', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue({ id: 'm1' } as any);
      await service.getMyPlan(patCtx('pp-1'), 'm1');
      expect(prisma.mealPlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm1', patientId: 'pp-1', visibleToPatient: true },
        }),
      );
    });

    it('setVisibility checks ownership then updates only the flag', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue({ id: 'm1' } as any); // requireOwnedPlan
      prisma.mealPlan.update.mockResolvedValue({ id: 'm1', visibleToPatient: true } as any);
      await service.setVisibility(ctx, 'm1', true);
      expect(prisma.mealPlan.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { visibleToPatient: true },
      });
    });
  });
});
