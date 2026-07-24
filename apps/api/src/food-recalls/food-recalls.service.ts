import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { CreateFoodRecallDto } from './dto/create-food-recall.dto';
import { UpdateFoodRecallDto } from './dto/update-food-recall.dto';
import { RecallMealDto } from './dto/recall-meal.dto';

// Always return meals and their items in stored order.
const FULL_TREE = {
  meals: {
    orderBy: { order: 'asc' },
    include: { items: { orderBy: { order: 'asc' } } },
  },
} as const;

@Injectable()
export class FoodRecallsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: AuthContext, dto: CreateFoodRecallDto) {
    await this.requireOwnedPatient(ctx, dto.patientId);
    const { patientId, meals, ...top } = dto;
    if (meals) await this.assertFoodsExist(meals);
    return this.prisma.foodRecall.create({
      data: {
        ...top,
        patientId,
        meals: meals ? this.mealsCreateInput(meals) : undefined,
      },
      include: FULL_TREE,
    });
  }

  async list(ctx: AuthContext, patientId: string) {
    await this.requireOwnedPatient(ctx, patientId);
    return this.prisma.foodRecall.findMany({
      where: { patientId },
      orderBy: { recallDate: 'desc' },
    });
  }

  async get(ctx: AuthContext, id: string) {
    const recall = await this.prisma.foodRecall.findFirst({
      where: { id, patient: { nutritionistId: resolveScopeNutritionistId(ctx) } },
      include: FULL_TREE,
    });
    if (!recall) {
      throw new NotFoundException('Food recall not found');
    }
    return recall;
  }

  async update(ctx: AuthContext, id: string, dto: UpdateFoodRecallDto) {
    await this.requireOwnedRecall(ctx, id);
    const { meals, ...top } = dto;

    // No tree provided: patch only the top-level fields.
    if (!meals) {
      return this.prisma.foodRecall.update({
        where: { id },
        data: top,
        include: FULL_TREE,
      });
    }

    // Tree provided: replace it wholesale (delete existing meals -> cascade
    // removes their items -> recreate), atomically.
    await this.assertFoodsExist(meals);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.recallMeal.deleteMany({ where: { foodRecallId: id } });
        return tx.foodRecall.update({
          where: { id },
          data: { ...top, meals: this.mealsCreateInput(meals) },
          include: FULL_TREE,
        });
      },
      { timeout: 20000, maxWait: 10000 },
    );
  }

  async delete(ctx: AuthContext, id: string) {
    await this.requireOwnedRecall(ctx, id);
    return this.prisma.foodRecall.delete({ where: { id } });
  }

  // Server-assigns `order` from array position at every level. Nothing is trusted
  // to carry its own order.
  private mealsCreateInput(meals: RecallMealDto[]) {
    return {
      create: meals.map((m, i) => ({
        name: m.name,
        timeLabel: m.timeLabel,
        order: i,
        items: m.items ? { create: m.items.map((it, k) => ({ ...it, order: k })) } : undefined,
      })),
    };
  }

  // Recusa (400) qualquer foodId de item que não exista no catálogo global Food —
  // evita referência pendente e o 500 de FK. Itens sem foodId (texto livre) passam.
  private async assertFoodsExist(meals: RecallMealDto[]): Promise<void> {
    const ids = [
      ...new Set(
        meals.flatMap((m) => m.items ?? []).map((it) => it.foodId).filter((id): id is string => !!id),
      ),
    ];
    if (ids.length === 0) return;
    const found = await this.prisma.food.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('Alimento inexistente referenciado no recordatório.');
    }
  }

  // A non-owned/missing id looks identical to the caller (404) so existence does
  // not leak across nutritionists.
  private async requireOwnedPatient(ctx: AuthContext, patientId: string): Promise<void> {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
  }

  private async requireOwnedRecall(ctx: AuthContext, id: string): Promise<void> {
    const recall = await this.prisma.foodRecall.findFirst({
      where: { id, patient: { nutritionistId: resolveScopeNutritionistId(ctx) } },
      select: { id: true },
    });
    if (!recall) {
      throw new NotFoundException('Food recall not found');
    }
  }
}
