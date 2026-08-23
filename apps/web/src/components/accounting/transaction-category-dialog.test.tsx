import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TransactionCategoryDialog } from './transaction-category-dialog';

vi.mock('@/lib/queries/transaction-categories', () => ({
  useCreateTransactionCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTransactionCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransactionCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('TransactionCategoryDialog', () => {
  it('exposes the category dialog anchors', () => {
    render(<TransactionCategoryDialog open onOpenChange={() => {}} />);
    expect(document.querySelector('form[data-tour="contabilidade.category.form"]')).not.toBeNull();
  });
});
