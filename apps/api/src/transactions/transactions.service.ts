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
}
