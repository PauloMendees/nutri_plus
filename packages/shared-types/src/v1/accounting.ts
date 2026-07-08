export type TransactionType = 'INCOME' | 'EXPENSE';

export interface TransactionCategory {
  id: string;
  name: string;
  type: TransactionType;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  categoryId: string | null;
  category: TransactionCategory | null;
  amountCents: number;
  occurredOn: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

// A statement row: a transaction plus the running account balance after it.
export type StatementItem = Transaction & { balanceCents: number };

export interface AccountingStatement {
  openingBalanceCents: number;
  totals: { incomeCents: number; expenseCents: number; netCents: number };
  items: StatementItem[];
}

export interface MonthlyAccountingSummary {
  month: string; // 'YYYY-MM'
  incomeCents: number;
  expenseCents: number;
}

export interface CreateTransactionRequest {
  type: TransactionType;
  amountCents: number;
  occurredOn: string;
  categoryId?: string | null;
  description?: string | null;
}

export type UpdateTransactionRequest = Partial<CreateTransactionRequest>;

export interface CreateTransactionCategoryRequest {
  name: string;
  type: TransactionType;
}

export type UpdateTransactionCategoryRequest = Partial<CreateTransactionCategoryRequest>;
