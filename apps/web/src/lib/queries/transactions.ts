import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTransactionRequest,
  UpdateTransactionRequest,
} from '@nutri-plus/shared-types';
import {
  createTransaction,
  deleteTransaction,
  getMonthlySummary,
  getStatement,
  updateTransaction,
} from '@/lib/api/transactions';

export function useStatement(fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ['transactions', 'statement', fromISO, toISO],
    queryFn: () => getStatement(fromISO, toISO),
  });
}

export function useMonthlySummary(months = 12) {
  return useQuery({
    queryKey: ['transactions', 'monthly-summary', months],
    queryFn: () => getMonthlySummary(months),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['transactions'] });
}

export function useCreateTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateTransactionRequest) => createTransaction(body),
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTransactionRequest }) =>
      updateTransaction(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: invalidate,
  });
}
