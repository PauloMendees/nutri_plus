import { NotFoundException } from '@nestjs/common';
import { TransactionCategoriesService } from './transaction-categories.service';

const CTX = { user: { role: 'NUTRITIONIST', nutritionistProfile: { id: 'nut-1' } } } as never;

function makePrisma() {
  const transactionCategory = {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const prisma: any = { transactionCategory };
  return { prisma, transactionCategory };
}

describe('TransactionCategoriesService', () => {
  it('creates a category scoped to the nutritionist', async () => {
    const { prisma, transactionCategory } = makePrisma();
    transactionCategory.create.mockResolvedValue({ id: 'c1' });
    const service = new TransactionCategoriesService(prisma as never);

    await service.create(CTX, { name: 'Consultas', type: 'INCOME' });

    expect(transactionCategory.create).toHaveBeenCalledWith({
      data: { nutritionistId: 'nut-1', name: 'Consultas', type: 'INCOME' },
    });
  });

  it('lists the scope categories, optionally filtered by type, ordered by name', async () => {
    const { prisma, transactionCategory } = makePrisma();
    transactionCategory.findMany.mockResolvedValue([]);
    const service = new TransactionCategoriesService(prisma as never);

    await service.list(CTX, 'EXPENSE');

    expect(transactionCategory.findMany).toHaveBeenCalledWith({
      where: { nutritionistId: 'nut-1', type: 'EXPENSE' },
      orderBy: { name: 'asc' },
    });
  });

  it('throws NotFound when updating a category outside the scope', async () => {
    const { prisma, transactionCategory } = makePrisma();
    transactionCategory.findFirst.mockResolvedValue(null);
    const service = new TransactionCategoriesService(prisma as never);

    await expect(service.update(CTX, 'x', { name: 'y' })).rejects.toBeInstanceOf(NotFoundException);
    expect(transactionCategory.update).not.toHaveBeenCalled();
  });
});
