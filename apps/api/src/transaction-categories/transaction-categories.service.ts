import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { TransactionType } from '../generated/prisma/client';
import { CreateTransactionCategoryDto } from './dto/create-transaction-category.dto';
import { UpdateTransactionCategoryDto } from './dto/update-transaction-category.dto';

@Injectable()
export class TransactionCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: AuthContext, dto: CreateTransactionCategoryDto) {
    return this.prisma.transactionCategory.create({
      data: {
        nutritionistId: resolveScopeNutritionistId(ctx),
        name: dto.name,
        type: dto.type,
      },
    });
  }

  async list(ctx: AuthContext, type?: TransactionType) {
    return this.prisma.transactionCategory.findMany({
      where: { nutritionistId: resolveScopeNutritionistId(ctx), ...(type ? { type } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  async getOne(ctx: AuthContext, id: string) {
    const category = await this.prisma.transactionCategory.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
    });
    if (!category) {
      throw new NotFoundException('Transaction category not found');
    }
    return category;
  }

  async update(ctx: AuthContext, id: string, dto: UpdateTransactionCategoryDto) {
    const existing = await this.prisma.transactionCategory.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Transaction category not found');
    }
    return this.prisma.transactionCategory.update({
      where: { id },
      data: { name: dto.name, type: dto.type },
    });
  }

  async remove(ctx: AuthContext, id: string): Promise<void> {
    const existing = await this.prisma.transactionCategory.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Transaction category not found');
    }
    await this.prisma.transactionCategory.delete({ where: { id } });
  }
}
