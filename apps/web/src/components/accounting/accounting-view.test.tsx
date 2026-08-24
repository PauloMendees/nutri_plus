import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AccountingStatement } from '@nutri-plus/shared-types';

const STATEMENT_FIXTURE: AccountingStatement = {
  openingBalanceCents: 10000,
  totals: { incomeCents: 50000, expenseCents: 20000, netCents: 30000 },
  items: [
    {
      id: 'b', type: 'EXPENSE', amountCents: 20000, occurredOn: '2026-07-05T12:00:00.000Z',
      categoryId: null, category: null, description: 'Aluguel', createdAt: '', updatedAt: '',
      balanceCents: 40000,
    },
    {
      id: 'a', type: 'INCOME', amountCents: 50000, occurredOn: '2026-07-02T12:00:00.000Z',
      categoryId: null, category: null, description: 'Consulta', createdAt: '', updatedAt: '',
      balanceCents: 60000,
    },
  ],
};

vi.mock('@/components/accounting/monthly-chart', () => ({
  MonthlyChart: () => <div data-testid="chart-stub" />,
}));
vi.mock('@/lib/queries/transaction-categories', () => ({
  useTransactionCategories: () => ({ data: [] }),
}));
vi.mock('@/lib/queries/transactions', () => ({
  useStatement: () => ({ isLoading: false, isError: false, data: STATEMENT_FIXTURE }),
  useCreateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { AccountingView } from './accounting-view';

describe('AccountingView tour anchors', () => {
  it('exposes the contabilidade anchors', () => {
    render(<AccountingView />);
    expect(screen.getByRole('heading', { name: 'Contabilidade' })).toHaveAttribute(
      'data-tour',
      'contabilidade.view',
    );
    expect(screen.getByRole('button', { name: 'Nova transação' })).toHaveAttribute(
      'data-tour',
      'contabilidade.new',
    );
    expect(document.querySelector('[data-tour="contabilidade.nav"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="contabilidade.chart"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="contabilidade.cards"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="contabilidade.table"]')).not.toBeNull();
  });
});
