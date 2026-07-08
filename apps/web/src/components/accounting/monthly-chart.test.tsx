import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { toChartData } from './monthly-chart';

vi.mock('@/lib/queries/transactions', () => ({
  useMonthlySummary: () => ({ data: [], isLoading: false }),
}));

describe('toChartData', () => {
  it('maps summary cents to reais and a short pt-BR month label', () => {
    const rows = toChartData([
      { month: '2026-07', incomeCents: 50000, expenseCents: 20000 },
      { month: '2026-08', incomeCents: 0, expenseCents: 1500 },
    ]);
    expect(rows).toEqual([
      { label: 'jul', income: 500, expense: 200 },
      { label: 'ago', income: 0, expense: 15 },
    ]);
  });
});

describe('MonthlyChart', () => {
  it('renders without crashing when there is no data', async () => {
    const { MonthlyChart } = await import('./monthly-chart');
    render(<MonthlyChart />);
    expect(screen.getByText(/entradas x saídas/i)).toBeInTheDocument();
  });
});
