import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { CreateMealPlanDto } from './dto/create-meal-plan.dto';
import { UpdateMealPlanDto } from './dto/update-meal-plan.dto';
import { MealDto } from './dto/meal.dto';

// Always return meals and their items in their stored order.
const FULL_TREE = {
  meals: {
    orderBy: { order: 'asc' },
    include: { items: { orderBy: { order: 'asc' } } },
  },
} as const;

@Injectable()
export class MealPlansService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Nutritionist surface (ownership via the patient's nutritionistId) ---

  async createPlan(ctx: AuthContext, dto: CreateMealPlanDto) {
    await this.requireOwnedPatient(ctx, dto.patientId);
    const { patientId, meals, ...top } = dto;
    return this.prisma.mealPlan.create({
      data: {
        ...top,
        patientId,
        ...(meals ? { meals: this.mealsCreateInput(meals) } : {}),
      },
      include: FULL_TREE,
    });
  }

  async listPlans(ctx: AuthContext, patientId: string) {
    await this.requireOwnedPatient(ctx, patientId);
    return this.prisma.mealPlan.findMany({
      where: { patientId, patient: { nutritionistId: this.nutritionistId(ctx) } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPlan(ctx: AuthContext, id: string) {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id, patient: { nutritionistId: this.nutritionistId(ctx) } },
      include: FULL_TREE,
    });
    if (!plan) {
      throw new NotFoundException('Meal plan not found');
    }
    return plan;
  }

  async updatePlan(ctx: AuthContext, id: string, dto: UpdateMealPlanDto) {
    await this.requireOwnedPlan(ctx, id);
    const { meals, ...top } = dto;

    // No tree provided: patch only the top-level fields.
    if (!meals) {
      return this.prisma.mealPlan.update({
        where: { id },
        data: top,
        include: FULL_TREE,
      });
    }

    // Tree provided: replace it wholesale (delete existing meals -> cascade
    // removes their items -> recreate), atomically.
    return this.prisma.$transaction(async (tx) => {
      await tx.meal.deleteMany({ where: { mealPlanId: id } });
      return tx.mealPlan.update({
        where: { id },
        data: { ...top, meals: this.mealsCreateInput(meals) },
        include: FULL_TREE,
      });
    });
  }

  async deletePlan(ctx: AuthContext, id: string) {
    await this.requireOwnedPlan(ctx, id);
    return this.prisma.mealPlan.delete({ where: { id } });
  }

  // --- Patient surface (ownership via the caller's own patientProfile.id) ---

  async listMyPlans(ctx: AuthContext) {
    return this.prisma.mealPlan.findMany({
      where: { patientId: this.patientProfileId(ctx) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyPlan(ctx: AuthContext, id: string) {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id, patientId: this.patientProfileId(ctx) },
      include: FULL_TREE,
    });
    if (!plan) {
      throw new NotFoundException('Meal plan not found');
    }
    return plan;
  }

  // --- Helpers ---

  // Server-assigns `order` from array position at every level. Items/meals are
  // never trusted to carry their own order.
  private mealsCreateInput(meals: MealDto[]) {
    return {
      create: meals.map((m, i) => ({
        name: m.name,
        timeLabel: m.timeLabel,
        instructions: m.instructions,
        order: i,
        ...(m.items
          ? {
              items: {
                create: m.items.map((it, j) => ({ ...it, order: j })),
              },
            }
          : {}),
      })),
    };
  }

  private nutritionistId(ctx: AuthContext): string {
    const id = ctx.user?.nutritionistProfile?.id;
    if (!id) {
      throw new ForbiddenException('Nutritionist profile required');
    }
    return id;
  }

  private patientProfileId(ctx: AuthContext): string {
    const id = ctx.user?.patientProfile?.id;
    if (!id) {
      throw new ForbiddenException('Patient profile required');
    }
    return id;
  }

  // A non-owned/missing id looks identical to the caller (404) so existence does
  // not leak across nutritionists.
  private async requireOwnedPatient(
    ctx: AuthContext,
    patientId: string,
  ): Promise<void> {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId: this.nutritionistId(ctx) },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
  }

  private async requireOwnedPlan(ctx: AuthContext, id: string): Promise<void> {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id, patient: { nutritionistId: this.nutritionistId(ctx) } },
      select: { id: true },
    });
    if (!plan) {
      throw new NotFoundException('Meal plan not found');
    }
  }
}
