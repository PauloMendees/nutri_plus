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

  it('rejects a bare type flip that would strand a now-mismatched category', async () => {
    const { prisma, transaction, transactionCategory } = makePrisma();
    transaction.findFirst.mockResolvedValue({ id: 't1', type: 'INCOME', categoryId: 'cat-1' });
    transactionCategory.findFirst.mockResolvedValue({ type: 'INCOME' });
    const service = new TransactionsService(prisma as never);

    await expect(service.update(CTX, 't1', { type: 'EXPENSE' } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('allows a type flip when categoryId is explicitly cleared', async () => {
    const { prisma, transaction, transactionCategory } = makePrisma();
    transaction.findFirst.mockResolvedValue({ id: 't1', type: 'INCOME', categoryId: 'cat-1' });
    transaction.update.mockResolvedValue({ id: 't1' });
    const service = new TransactionsService(prisma as never);

    await service.update(CTX, 't1', { type: 'EXPENSE', categoryId: null } as never);

    expect(transactionCategory.findFirst).not.toHaveBeenCalled();
    expect(transaction.update).toHaveBeenCalled();
  });
});

describe('TransactionsService statement', () => {
  const CTX2 = { user: { role: 'NUTRITIONIST', nutritionistProfile: { id: 'nut-1' } } } as never;

  it('computes opening balance, per-row running balance (newest-first), and totals', async () => {
    const { prisma, transaction } = makePrisma();
    // before `from`: +100 income → opening balance 100
    transaction.findMany
      .mockResolvedValueOnce([{ type: 'INCOME', amountCents: 100 }]) // opening query
      .mockResolvedValueOnce([
        { id: 'a', type: 'INCOME', amountCents: 500, occurredOn: new Date('2026-07-02'), category: null },
        { id: 'b', type: 'EXPENSE', amountCents: 200, occurredOn: new Date('2026-07-05'), category: null },
      ]); // period query (ascending)
    const service = new TransactionsService(prisma as never);

    const result = await service.getStatement(CTX2, {
      from: new Date('2026-07-01'),
      to: new Date('2026-08-01'),
    });

    expect(result.openingBalanceCents).toBe(100);
    expect(result.totals).toEqual({ incomeCents: 500, expenseCents: 200, netCents: 300 });
    // newest-first: b (balance 100+500-200=400), then a (100+500=600)
    expect(result.items.map((i) => [i.id, i.balanceCents])).toEqual([
      ['b', 400],
      ['a', 600],
    ]);
  });
});

describe('TransactionsService monthly summary', () => {
  const CTX2 = { user: { role: 'NUTRITIONIST', nutritionistProfile: { id: 'nut-1' } } } as never;

  it('buckets income/expense by month and zero-fills the range', async () => {
    const { prisma, transaction } = makePrisma();
    const now = new Date();
    transaction.findMany.mockResolvedValue([
      { type: 'INCOME', amountCents: 300, occurredOn: now },
      { type: 'EXPENSE', amountCents: 120, occurredOn: now },
    ]);
    const service = new TransactionsService(prisma as never);

    const result = await service.getMonthlySummary(CTX2, { months: 3 });

    expect(result).toHaveLength(3);
    // the current month is always the last bucket in the range
    const currentMonth = result[result.length - 1];
    expect(currentMonth).toEqual({
      month: currentMonth.month,
      incomeCents: 300,
      expenseCents: 120,
    });
    // every bucket present, even zero months, with numeric totals
    expect(
      result.every((m) => typeof m.incomeCents === 'number' && typeof m.expenseCents === 'number'),
    ).toBe(true);
  });
});
