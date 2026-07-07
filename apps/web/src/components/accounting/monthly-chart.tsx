'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyAccountingSummary } from '@nutri-plus/shared-types';
import { useMonthlySummary } from '@/lib/queries/transactions';
import { formatBRL } from '@/lib/format/currency';
import { Card } from '@/components/ui/card';

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

type ChartRow = { label: string; income: number; expense: number };

// Exported for unit testing the mapping without touching the SVG.
export function toChartData(summary: MonthlyAccountingSummary[]): ChartRow[] {
  return summary.map((m) => {
    const monthIndex = Number(m.month.slice(5, 7)) - 1;
    return {
      label: MONTH_ABBR[monthIndex] ?? m.month,
      income: m.incomeCents / 100,
      expense: m.expenseCents / 100,
    };
  });
}

export function MonthlyChart() {
  const query = useMonthlySummary(12);
  const data = toChartData(query.data ?? []);

  return (
    <Card className="p-4">
      <p className="mb-3 text-sm font-semibold">Entradas x Saídas (12 meses)</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" fontSize={11} stroke="var(--muted-foreground)" />
          <YAxis fontSize={11} stroke="var(--muted-foreground)" width={56} />
          <Tooltip
            formatter={(value: any) => {
              if (typeof value === 'number') {
                return formatBRL(Math.round(value * 100));
              }
              return '';
            }}
            labelClassName="text-foreground"
          />
          <Legend />
          <Bar name="Entradas" dataKey="income" fill="#16a34a" radius={[4, 4, 0, 0]} />
          <Bar name="Saídas" dataKey="expense" fill="#dc2626" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
