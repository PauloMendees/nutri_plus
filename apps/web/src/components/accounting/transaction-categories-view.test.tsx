import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionCategoriesView } from './transaction-categories-view';

vi.mock('@/lib/queries/transaction-categories', () => ({
  useTransactionCategories: () => ({
    isLoading: false,
    isError: false,
    data: [
      { id: 'c1', name: 'Consultas', type: 'INCOME', createdAt: '', updatedAt: '' },
      { id: 'c2', name: 'Aluguel', type: 'EXPENSE', createdAt: '', updatedAt: '' },
    ],
  }),
  useCreateTransactionCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTransactionCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransactionCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('TransactionCategoriesView', () => {
  it('lists categories with their type', () => {
    render(<TransactionCategoriesView />);
    expect(screen.getByText('Consultas')).toBeInTheDocument();
    expect(screen.getByText('Aluguel')).toBeInTheDocument();
    expect(screen.getByText('Receita')).toBeInTheDocument();
    expect(screen.getByText('Despesa')).toBeInTheDocument();
  });
});
