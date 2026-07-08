import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTransactionCategoryRequest,
  TransactionType,
  UpdateTransactionCategoryRequest,
} from '@nutri-plus/shared-types';
import {
  createTransactionCategory,
  deleteTransactionCategory,
  listTransactionCategories,
  updateTransactionCategory,
} from '@/lib/api/transaction-categories';

export function useTransactionCategories(type?: TransactionType) {
  return useQuery({
    queryKey: ['transaction-categories', type ?? 'all'],
    queryFn: () => listTransactionCategories(type),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['transaction-categories'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  };
}

export function useCreateTransactionCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateTransactionCategoryRequest) => createTransactionCategory(body),
    onSuccess: invalidate,
  });
}

export function useUpdateTransactionCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTransactionCategoryRequest }) =>
      updateTransactionCategory(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteTransactionCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deleteTransactionCategory(id),
    onSuccess: invalidate,
  });
}
