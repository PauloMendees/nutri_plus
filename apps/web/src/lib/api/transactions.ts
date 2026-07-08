import type {
  AccountingStatement,
  CreateTransactionRequest,
  MonthlyAccountingSummary,
  Transaction,
  UpdateTransactionRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function getStatement(fromISO: string, toISO: string): Promise<AccountingStatement> {
  return browserApiFetch<AccountingStatement>(
    `/transactions/statement?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`,
  );
}

export function getMonthlySummary(months = 12): Promise<MonthlyAccountingSummary[]> {
  return browserApiFetch<MonthlyAccountingSummary[]>(`/transactions/monthly-summary?months=${months}`);
}

export function createTransaction(body: CreateTransactionRequest): Promise<Transaction> {
  return browserApiFetch<Transaction>('/transactions', { method: 'POST', body });
}

export function updateTransaction(id: string, body: UpdateTransactionRequest): Promise<Transaction> {
  return browserApiFetch<Transaction>(`/transactions/${id}`, { method: 'PATCH', body });
}

export function deleteTransaction(id: string): Promise<void> {
  return browserApiFetch<void>(`/transactions/${id}`, { method: 'DELETE' });
}
