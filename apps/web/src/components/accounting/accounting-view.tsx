'use client';

import { useMemo, useState } from 'react';
import type { StatementItem } from '@nutri-plus/shared-types';
import { useStatement } from '@/lib/queries/transactions';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SummaryCards } from '@/components/accounting/summary-cards';
import { StatementTable } from '@/components/accounting/statement-table';
import { MonthlyChart } from '@/components/accounting/monthly-chart';
import { TransactionDialog } from '@/components/accounting/transaction-dialog';

// [start-of-month, start-of-next-month) in UTC for the given year/month index.
function monthRange(year: number, month: number): { fromISO: string; toISO: string } {
  return {
    fromISO: new Date(Date.UTC(year, month, 1)).toISOString(),
    toISO: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  };
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function AccountingView() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StatementItem | null>(null);

  const { fromISO, toISO } = useMemo(() => monthRange(year, month), [year, month]);
  const statement = useStatement(fromISO, toISO);

  function shift(delta: number) {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-2xl font-bold">Contabilidade</h1>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => shift(-1)}>
            ‹
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-medium capitalize">
            {MONTHS[month]} {year}
          </span>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => shift(1)}>
            ›
          </Button>
        </div>
        <Button className="rounded-full" onClick={() => setCreating(true)}>
          Nova transação
        </Button>
      </div>

      <MonthlyChart />

      {statement.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : statement.isError || !statement.data ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar o extrato.
        </div>
      ) : (
        <>
          <SummaryCards totals={statement.data.totals} />
          <StatementTable statement={statement.data} onEdit={(item) => setEditing(item)} />
        </>
      )}

      <TransactionDialog open={creating} onOpenChange={(o) => !o && setCreating(false)} />
      {editing && (
        <TransactionDialog open onOpenChange={(o) => !o && setEditing(null)} transaction={editing} />
      )}
    </div>
  );
}
