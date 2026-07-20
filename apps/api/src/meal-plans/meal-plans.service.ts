import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { CreateMealPlanDto } from './dto/create-meal-plan.dto';
import { UpdateMealPlanDto } from './dto/update-meal-plan.dto';
import { MealDto } from './dto/meal.dto';

export interface GeneratedMealInput {
  name: string;
  timeLabel?: string;
  options: {
    label?: string;
    items: { foodName: string; quantity: string; calories: number; protein: number; carbs: number; fats: number }[];
  }[];
}

// Always return meals, their options, and the option items in stored order.
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

@Injectable()
export class MealPlansService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Nutritionist surface (ownership via the patient's nutritionistId) ---

  async createPlan(ctx: AuthContext, dto: CreateMealPlanDto) {
    await this.requireOwnedPatient(ctx, dto.patientId);
    const { patientId, meals, ...top } = dto;
    if (meals) await this.assertFoodsExist(meals);
    return this.prisma.mealPlan.create({
      data: {
        ...top,
        patientId,
        meals: meals ? this.mealsCreateInput(meals) : undefined,
      },
      include: FULL_TREE,
    });
  }

  // Persists an AI-generated plan: ownership-checked, aiGenerated=true, with the
  // server-computed daily targets. Reuses the same ordered-tree write as manual
  // creation so all MealPlan aggregate writes live here.
  async createGeneratedPlan(
    ctx: AuthContext,
    args: {
      patientId: string;
      title?: string;
      targets: { calories: number; protein: number; carbs: number; fats: number };
      meals: GeneratedMealInput[];
    },
  ) {
    await this.requireOwnedPatient(ctx, args.patientId);
    return this.prisma.mealPlan.create({
      data: {
        patientId: args.patientId,
        title: args.title,
        aiGenerated: true,
        targetCalories: args.targets.calories,
        targetProtein: args.targets.protein,
        targetCarbs: args.targets.carbs,
        targetFats: args.targets.fats,
        meals: this.mealsCreateInput(args.meals),
      },
      include: FULL_TREE,
    });
  }

  async listPlans(ctx: AuthContext, patientId: string) {
    await this.requireOwnedPatient(ctx, patientId);
    return this.prisma.mealPlan.findMany({
      where: { patientId, patient: { nutritionistId: resolveScopeNutritionistId(ctx) } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPlan(ctx: AuthContext, id: string) {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id, patient: { nutritionistId: resolveScopeNutritionistId(ctx) } },
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
    // Deleting + recreating the whole meals/options/items tree and reading it
    // back over a remote DB can take ~6-7s for a full plan — past Prisma's 5s
    // default interactive-transaction timeout (→ P2028 → 500). Give it room.
    await this.assertFoodsExist(meals);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.meal.deleteMany({ where: { mealPlanId: id } });
        return tx.mealPlan.update({
          where: { id },
          data: { ...top, meals: this.mealsCreateInput(meals) },
          include: FULL_TREE,
        });
      },
      { timeout: 20000, maxWait: 10000 },
    );
  }

  async deletePlan(ctx: AuthContext, id: string) {
    await this.requireOwnedPlan(ctx, id);
    return this.prisma.mealPlan.delete({ where: { id } });
  }

  async setVisibility(ctx: AuthContext, id: string, visibleToPatient: boolean) {
    await this.requireOwnedPlan(ctx, id);
    return this.prisma.mealPlan.update({
      where: { id },
      data: { visibleToPatient },
    });
  }

  // --- Patient surface (ownership via the caller's own patientProfile.id) ---

  async listMyPlans(ctx: AuthContext) {
    return this.prisma.mealPlan.findMany({
      where: { patientId: this.patientProfileId(ctx), visibleToPatient: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyPlan(ctx: AuthContext, id: string) {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id, patientId: this.patientProfileId(ctx), visibleToPatient: true },
      include: FULL_TREE,
    });
    if (!plan) {
      throw new NotFoundException('Meal plan not found');
    }
    return plan;
  }

  // --- Helpers ---

  // Server-assigns `order` from array position at every level. Nothing is trusted
  // to carry its own order.
  private mealsCreateInput(meals: MealDto[]) {
    return {
      create: meals.map((m, i) => ({
        name: m.name,
        timeLabel: m.timeLabel,
        instructions: m.instructions,
        order: i,
        options: m.options
          ? {
              create: m.options.map((o, j) => ({
                label: o.label,
                order: j,
                items: o.items
                  ? { create: o.items.map((it, k) => ({ ...it, order: k })) }
                  : undefined,
              })),
            }
          : undefined,
      })),
    };
  }

  // Recusa (400) qualquer foodId de item que não exista no catálogo global Food —
  // evita referência pendente e o 500 de FK. Itens sem foodId (texto livre) passam.
  private async assertFoodsExist(meals: MealDto[]): Promise<void> {
    const ids = [
      ...new Set(
        meals
          .flatMap((m) => m.options ?? [])
          .flatMap((o) => o.items ?? [])
          .map((it) => it.foodId)
          .filter((id): id is string => !!id),
      ),
    ];
    if (ids.length === 0) return;
    const found = await this.prisma.food.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('Alimento inexistente referenciado no plano.');
    }
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
      where: { id: patientId, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
  }

  private async requireOwnedPlan(ctx: AuthContext, id: string): Promise<void> {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id, patient: { nutritionistId: resolveScopeNutritionistId(ctx) } },
      select: { id: true },
    });
    if (!plan) {
      throw new NotFoundException('Meal plan not found');
    }
  }
}
