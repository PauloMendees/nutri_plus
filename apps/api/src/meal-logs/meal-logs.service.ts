import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MealLog } from '@nutri-plus/shared-types';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId, resolveScopePatientId } from '../auth/auth-scope';
import { CreateMealLogDto } from './dto/create-meal-log.dto';
import { ListMealLogsQueryDto } from './dto/list-meal-logs-query.dto';

export const MEAL_LOG_LOCK_MESSAGE =
  'Só é possível editar ou apagar uma refeição nas primeiras 24 horas.';
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FUTURE_SLACK_MS = 5 * 60 * 1000;

type MealLogRow = {
  id: string;
  patientId: string;
  consumedAt: Date;
  source: 'PLAN' | 'FREE_TEXT';
  note: string | null;
  freeText: string | null;
  mealName: string | null;
  mealTimeLabel: string | null;
  optionLabel: string | null;
  itemsJson: unknown;
  mealPlanId: string | null;
  mealId: string | null;
  mealOptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class MealLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: AuthContext, dto: CreateMealLogDto): Promise<MealLog> {
    const patientId = resolveScopePatientId(ctx);
    const data = await this.buildData(patientId, dto);
    const created = await this.prisma.mealLog.create({ data });
    return this.toMealLog(created);
  }

  async listMine(ctx: AuthContext, query: ListMealLogsQueryDto): Promise<MealLog[]> {
    const patientId = resolveScopePatientId(ctx);
    const rows = await this.prisma.mealLog.findMany({
      where: this.listWhere(patientId, query),
      orderBy: { consumedAt: 'desc' },
    });
    return rows.map((row) => this.toMealLog(row));
  }

  async update(ctx: AuthContext, id: string, dto: CreateMealLogDto): Promise<MealLog> {
    const existing = await this.getOwned(ctx, id);
    this.assertEditable(existing.createdAt);
    const data = await this.buildData(existing.patientId, dto);
    const updated = await this.prisma.mealLog.update({ where: { id }, data });
    return this.toMealLog(updated);
  }

  async remove(ctx: AuthContext, id: string): Promise<void> {
    const existing = await this.getOwned(ctx, id);
    this.assertEditable(existing.createdAt);
    await this.prisma.mealLog.delete({ where: { id } });
  }

  async listForPatient(
    ctx: AuthContext,
    patientId: string,
    query: ListMealLogsQueryDto,
  ): Promise<MealLog[]> {
    const owned = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId: resolveScopeNutritionistId(ctx) },
    });
    if (!owned) {
      throw new NotFoundException('Patient not found');
    }
    const rows = await this.prisma.mealLog.findMany({
      where: this.listWhere(patientId, query),
      orderBy: { consumedAt: 'desc' },
    });
    return rows.map((row) => this.toMealLog(row));
  }

  private toMealLog(row: MealLogRow): MealLog {
    return {
      id: row.id,
      patientId: row.patientId,
      consumedAt: row.consumedAt.toISOString(),
      source: row.source,
      note: row.note,
      freeText: row.freeText,
      mealName: row.mealName,
      mealTimeLabel: row.mealTimeLabel,
      optionLabel: row.optionLabel,
      itemsJson: (row.itemsJson as MealLog['itemsJson']) ?? null,
      mealPlanId: row.mealPlanId,
      mealId: row.mealId,
      mealOptionId: row.mealOptionId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      editableUntil: new Date(row.createdAt.getTime() + EDIT_WINDOW_MS).toISOString(),
    };
  }

  private assertEditable(createdAt: Date): void {
    if (Date.now() >= createdAt.getTime() + EDIT_WINDOW_MS) {
      throw new ForbiddenException(MEAL_LOG_LOCK_MESSAGE);
    }
  }

  private parseConsumedAt(iso: string): Date {
    const date = new Date(iso);
    if (date.getTime() > Date.now() + FUTURE_SLACK_MS) {
      throw new BadRequestException('Data inválida.');
    }
    return date;
  }

  private async snapshotFromOption(patientId: string, mealOptionId: string) {
    const latest = await this.prisma.mealPlan.findFirst({
      where: { patientId, visibleToPatient: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!latest) {
      throw new BadRequestException('Nenhum plano disponível.');
    }
    const option = await this.prisma.mealOption.findFirst({
      where: { id: mealOptionId, meal: { mealPlanId: latest.id } },
      include: { meal: true, items: { orderBy: { order: 'asc' } } },
    });
    if (!option) {
      throw new BadRequestException('Opção não pertence ao plano atual.');
    }
    return {
      mealName: option.meal.name,
      mealTimeLabel: option.meal.timeLabel,
      optionLabel: option.label,
      itemsJson: option.items.map((item) => ({
        foodName: item.foodName,
        quantity: item.quantity,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fats: item.fats,
        grams: item.grams,
      })),
      mealPlanId: option.meal.mealPlanId,
      mealId: option.meal.id,
      mealOptionId: option.id,
    };
  }

  private async buildData(patientId: string, dto: CreateMealLogDto) {
    const consumedAt = this.parseConsumedAt(dto.consumedAt);
    if (dto.source === 'PLAN') {
      if (!dto.mealOptionId) {
        throw new BadRequestException('Opção não pertence ao plano atual.');
      }
      const snapshot = await this.snapshotFromOption(patientId, dto.mealOptionId);
      return {
        patientId,
        consumedAt,
        source: 'PLAN' as const,
        note: dto.note ?? null,
        freeText: null,
        ...snapshot,
      };
    }
    if (!dto.freeText) {
      throw new BadRequestException('Texto da refeição é obrigatório.');
    }
    return {
      patientId,
      consumedAt,
      source: 'FREE_TEXT' as const,
      note: dto.note ?? null,
      freeText: dto.freeText,
      mealName: null,
      mealTimeLabel: null,
      optionLabel: null,
      itemsJson: Prisma.DbNull,
      mealPlanId: null,
      mealId: null,
      mealOptionId: null,
    };
  }

  private listWhere(patientId: string, query: ListMealLogsQueryDto) {
    const now = new Date();
    const to = query.to ? this.parseToBound(query.to) : now;
    const consumedAt: { lte: Date; gte?: Date } = { lte: to };
    if (!query.all) {
      consumedAt.gte = query.from
        ? new Date(query.from)
        : new Date(now.getTime() - THIRTY_DAYS_MS);
    }
    return { patientId, consumedAt };
  }

  private parseToBound(iso: string): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      return new Date(`${iso}T23:59:59.999Z`);
    }
    return new Date(iso);
  }

  private async getOwned(ctx: AuthContext, id: string) {
    const log = await this.prisma.mealLog.findFirst({
      where: { id, patientId: resolveScopePatientId(ctx) },
    });
    if (!log) {
      throw new NotFoundException('Meal log not found');
    }
    return log;
  }
}
