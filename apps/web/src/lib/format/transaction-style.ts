import type { TransactionType } from '@nutri-plus/shared-types';

// One source of truth for the income (green) / expense (red) semantic colors,
// with light + dark variants, shared by the statement, summary cards, category
// badges, and the monthly chart.

// Signed amount / net text (statement rows, summary cards).
export const AMOUNT_TEXT_CLASS: Record<TransactionType, string> = {
  INCOME: 'text-green-600 dark:text-green-400',
  EXPENSE: 'text-red-600 dark:text-red-400',
};

// Type pill (category list).
export const TYPE_BADGE_CLASS: Record<TransactionType, string> = {
  INCOME: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  EXPENSE: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

// recharts <Bar fill> takes a raw color, not a Tailwind class — same source.
export const AMOUNT_HEX = { income: '#16a34a', expense: '#dc2626' } as const;
