import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatementTable } from './statement-table';
import type { AccountingStatement } from '@nutri-plus/shared-types';

const statement: AccountingStatement = {
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

describe('StatementTable', () => {
  it('renders rows with signed amounts and the running balance', () => {
    render(<StatementTable statement={statement} onEdit={vi.fn()} />);
    expect(screen.getByText('Aluguel')).toBeInTheDocument();
    expect(screen.getByText('Consulta')).toBeInTheDocument();
    // expense shown negative, income positive (BRL uses  )
    expect(screen.getByText('-R$ 200,00')).toBeInTheDocument();
    expect(screen.getByText('+R$ 500,00')).toBeInTheDocument();
    // running balances
    expect(screen.getByText('R$ 400,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 600,00')).toBeInTheDocument();
  });

  it('shows an empty state with no items', () => {
    render(
      <StatementTable
        statement={{ openingBalanceCents: 0, totals: { incomeCents: 0, expenseCents: 0, netCents: 0 }, items: [] }}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText(/nenhuma transação/i)).toBeInTheDocument();
  });
});
