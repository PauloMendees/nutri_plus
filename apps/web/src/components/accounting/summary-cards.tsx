'use client';

import type { AccountingStatement } from '@nutri-plus/shared-types';
import { formatBRL } from '@/lib/format/currency';
import { Card } from '@/components/ui/card';

export function SummaryCards({ totals }: { totals: AccountingStatement['totals'] }) {
  const cards = [
    { label: 'Entradas', value: totals.incomeCents, className: 'text-green-600' },
    { label: 'Saídas', value: totals.expenseCents, className: 'text-red-600' },
    {
      label: 'Saldo',
      value: totals.netCents,
      className: totals.netCents >= 0 ? 'text-green-600' : 'text-red-600',
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label} className="p-4">
          <p className="text-xs uppercase text-muted-foreground">{c.label}</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${c.className}`}>{formatBRL(c.value)}</p>
        </Card>
      ))}
    </div>
  );
}
