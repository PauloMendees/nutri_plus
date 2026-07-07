import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

const CTX = { user: { role: 'NUTRITIONIST', nutritionistProfile: { id: 'nut-1' } } } as never;

function makePrisma() {
  const transaction = {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const transactionCategory = { findFirst: jest.fn() };
  const prisma: any = { transaction, transactionCategory };
  return { prisma, transaction, transactionCategory };
}

const CREATE = {
  type: 'EXPENSE' as const,
  amountCents: 5000,
  occurredOn: new Date('2026-07-03'),
  categoryId: 'cat-1',
  description: 'Aluguel',
};

describe('TransactionsService CRUD', () => {
  it('creates a transaction scoped to the nutritionist, including the category', async () => {
    const { prisma, transaction, transactionCategory } = makePrisma();
    transactionCategory.findFirst.mockResolvedValue({ id: 'cat-1', type: 'EXPENSE' });
    transaction.create.mockResolvedValue({ id: 't1' });
    const service = new TransactionsService(prisma as never);

    await service.create(CTX, CREATE);

    expect(transaction.create).toHaveBeenCalledWith({
      data: {
        nutritionistId: 'nut-1',
        type: 'EXPENSE',
        amountCents: 5000,
        occurredOn: CREATE.occurredOn,
        categoryId: 'cat-1',
        description: 'Aluguel',
      },
      include: { category: true },
    });
  });

  it('rejects a category whose type does not match the transaction type', async () => {
    const { prisma, transaction, transactionCategory } = makePrisma();
    transactionCategory.findFirst.mockResolvedValue({ id: 'cat-1', type: 'INCOME' });
    const service = new TransactionsService(prisma as never);

    await expect(service.create(CTX, CREATE)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.create).not.toHaveBeenCalled();
  });

  it('rejects a category outside the scope', async () => {
    const { prisma, transaction, transactionCategory } = makePrisma();
    transactionCategory.findFirst.mockResolvedValue(null);
    const service = new TransactionsService(prisma as never);

    await expect(service.create(CTX, CREATE)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.create).not.toHaveBeenCalled();
  });

  it('removes only an owned transaction', async () => {
    const { prisma, transaction } = makePrisma();
    transaction.findFirst.mockResolvedValue(null);
    const service = new TransactionsService(prisma as never);

    await expect(service.remove(CTX, 't1')).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.delete).not.toHaveBeenCalled();
  });
});
