import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { TransactionType } from '../generated/prisma/client';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

const TRANSACTION_INCLUDE = { category: true } as const;

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: AuthContext, dto: CreateTransactionDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    if (dto.categoryId) {
      await this.assertCategoryMatches(nutritionistId, dto.categoryId, dto.type);
    }
    return this.prisma.transaction.create({
      data: {
        nutritionistId,
        type: dto.type,
        amountCents: dto.amountCents,
        occurredOn: dto.occurredOn,
        categoryId: dto.categoryId ?? null,
        description: dto.description ?? null,
      },
      include: TRANSACTION_INCLUDE,
    });
  }

  async getOne(ctx: AuthContext, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      include: TRANSACTION_INCLUDE,
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async update(ctx: AuthContext, id: string, dto: UpdateTransactionDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const existing = await this.prisma.transaction.findFirst({
      where: { id, nutritionistId },
    });
    if (!existing) {
      throw new NotFoundException('Transaction not found');
    }
    // The category (if set) must match the resulting transaction type.
    const nextType = dto.type ?? existing.type;
    if (dto.categoryId) {
      await this.assertCategoryMatches(nutritionistId, dto.categoryId, nextType);
    } else if (dto.categoryId === undefined && dto.type && dto.type !== existing.type && existing.categoryId) {
      // A bare type flip must not strand a now-mismatched category.
      await this.assertCategoryMatches(nutritionistId, existing.categoryId, nextType);
    }
    return this.prisma.transaction.update({
      where: { id },
      data: {
        type: dto.type,
        amountCents: dto.amountCents,
        occurredOn: dto.occurredOn,
        categoryId: dto.categoryId,
        description: dto.description,
      },
      include: TRANSACTION_INCLUDE,
    });
  }

  async remove(ctx: AuthContext, id: string): Promise<void> {
    const existing = await this.prisma.transaction.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Transaction not found');
    }
    await this.prisma.transaction.delete({ where: { id } });
  }

  // The category must belong to the scope and share the transaction's type.
  private async assertCategoryMatches(
    nutritionistId: string,
    categoryId: string,
    type: TransactionType,
  ): Promise<void> {
    const category = await this.prisma.transactionCategory.findFirst({
      where: { id: categoryId, nutritionistId },
      select: { type: true },
    });
    if (!category || category.type !== type) {
      throw new BadRequestException('Invalid category for this transaction type');
    }
  }

  async getStatement(ctx: AuthContext, params: { from: Date; to: Date }) {
    const nutritionistId = resolveScopeNutritionistId(ctx);

    // The opening-balance and period queries are independent — run concurrently.
    const [before, periodAsc] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { nutritionistId, occurredOn: { lt: params.from } },
        select: { type: true, amountCents: true },
      }),
      this.prisma.transaction.findMany({
        where: { nutritionistId, occurredOn: { gte: params.from, lt: params.to } },
        orderBy: [{ occurredOn: 'asc' }, { createdAt: 'asc' }],
        include: TRANSACTION_INCLUDE,
      }),
    ]);
    const openingBalanceCents = before.reduce((sum, t) => sum + signed(t), 0);

    let running = openingBalanceCents;
    let incomeCents = 0;
    let expenseCents = 0;
    const withBalanceAsc = periodAsc.map((t) => {
      running += signed(t);
      if (t.type === 'INCOME') incomeCents += t.amountCents;
      else expenseCents += t.amountCents;
      return { ...t, balanceCents: running };
    });

    return {
      openingBalanceCents,
      totals: { incomeCents, expenseCents, netCents: incomeCents - expenseCents },
      items: withBalanceAsc.reverse(), // newest-first for display
    };
  }

  async getMonthlySummary(ctx: AuthContext, params: { months?: number }) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const months = params.months ?? 12;
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

    const rows = await this.prisma.transaction.findMany({
      where: { nutritionistId, occurredOn: { gte: start } },
      select: { type: true, amountCents: true, occurredOn: true },
    });

    const buckets = new Map<string, { incomeCents: number; expenseCents: number }>();
    for (let i = 0; i < months; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      buckets.set(monthKey(d), { incomeCents: 0, expenseCents: 0 });
    }
    for (const r of rows) {
      const bucket = buckets.get(monthKey(r.occurredOn));
      if (!bucket) continue;
      if (r.type === 'INCOME') bucket.incomeCents += r.amountCents;
      else bucket.expenseCents += r.amountCents;
    }
    return [...buckets.entries()].map(([month, v]) => ({ month, ...v }));
  }
}

function signed(t: { type: TransactionType; amountCents: number }): number {
  return t.type === 'INCOME' ? t.amountCents : -t.amountCents;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
