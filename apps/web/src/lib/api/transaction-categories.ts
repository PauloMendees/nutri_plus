import type {
  CreateTransactionCategoryRequest,
  TransactionCategory,
  TransactionType,
  UpdateTransactionCategoryRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listTransactionCategories(type?: TransactionType): Promise<TransactionCategory[]> {
  const q = type ? `?type=${type}` : '';
  return browserApiFetch<TransactionCategory[]>(`/transaction-categories${q}`);
}

export function createTransactionCategory(
  body: CreateTransactionCategoryRequest,
): Promise<TransactionCategory> {
  return browserApiFetch<TransactionCategory>('/transaction-categories', { method: 'POST', body });
}

export function updateTransactionCategory(
  id: string,
  body: UpdateTransactionCategoryRequest,
): Promise<TransactionCategory> {
  return browserApiFetch<TransactionCategory>(`/transaction-categories/${id}`, {
    method: 'PATCH',
    body,
  });
}

export function deleteTransactionCategory(id: string): Promise<void> {
  return browserApiFetch<void>(`/transaction-categories/${id}`, { method: 'DELETE' });
}
