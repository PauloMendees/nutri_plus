import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { runFixture } from '@/lib/onboarding/fixtures';
import { TransactionDialog } from './transaction-dialog';

const createMutate = vi.fn().mockResolvedValue({});
vi.mock('@/lib/queries/transactions', () => ({
  useCreateTransaction: () => ({ mutateAsync: createMutate, isPending: false }),
  useUpdateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/queries/transaction-categories', () => ({
  useTransactionCategories: () => ({ data: [], isLoading: false }),
}));

describe('TransactionDialog', () => {
  it('submits the amount as integer cents', async () => {
    render(<TransactionDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '1.234,56' } });
    fireEvent.change(screen.getByLabelText(/data/i), { target: { value: '2026-07-03' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(createMutate).toHaveBeenCalled());
    expect(createMutate.mock.calls[0][0]).toMatchObject({ amountCents: 123456, type: 'EXPENSE' });
  });

  it('exposes the transaction dialog anchors', () => {
    render(<TransactionDialog open onOpenChange={() => {}} />);
    expect(document.querySelector('form[data-tour="contabilidade.form"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveAttribute('data-tour', 'contabilidade.save');
  });

  it('fills the transaction fixture without submitting', () => {
    render(<TransactionDialog open onOpenChange={() => {}} />);
    act(() => runFixture('transaction'));
    expect(screen.getByLabelText('Valor (R$) *')).toHaveValue('100,00');
    expect(screen.getByLabelText('Descrição')).toHaveValue('Lançamento de demonstração');
  });
});
