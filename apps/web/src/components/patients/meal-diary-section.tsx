'use client';

import { useMemo, useState } from 'react';
import type { MealLog, MealLogItemSnapshot } from '@nutri-plus/shared-types';
import { usePatientMealLogs } from '@/lib/queries/meal-logs';
import type { MealLogRange } from '@/lib/api/meal-logs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const RANGES: { value: MealLogRange; label: string }[] = [
  { value: '30', label: '30' },
  { value: '90', label: '90' },
  { value: 'all', label: 'Tudo' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function groupByDay(logs: MealLog[]): { date: string; logs: MealLog[] }[] {
  const groups: { date: string; logs: MealLog[] }[] = [];
  for (const log of logs) {
    const date = formatDate(log.consumedAt);
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.logs.push(log);
    else groups.push({ date, logs: [log] });
  }
  return groups;
}

function planTitle(log: MealLog): string {
  return `${log.mealName ?? 'Refeição'} · ${log.optionLabel ?? 'Opção'}`;
}

function foodLine(item: MealLogItemSnapshot): string {
  return [item.foodName, item.quantity].filter(Boolean).join(' ');
}

export function MealDiarySection({ patientId }: { patientId: string }) {
  const [range, setRange] = useState<MealLogRange>('30');
  const query = usePatientMealLogs(patientId, range);
  const logs = query.data ?? [];
  const groups = useMemo(() => groupByDay(logs), [logs]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-bold">Diário</h2>
        <div className="flex w-fit items-center gap-1 rounded-full border p-1 text-sm">
          {RANGES.map((r) => (
            <Button
              key={r.value}
              type="button"
              variant={range === r.value ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={range === r.value}
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {query.isLoading && (
        <div data-testid="meal-diary-loading" className="rounded-xl border bg-card p-4">
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {query.isError && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar.{' '}
          <button onClick={() => query.refetch()} className="font-semibold text-primary hover:underline">
            Tentar de novo
          </button>
        </div>
      )}
      {query.data && logs.length === 0 && (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          O paciente ainda não registrou refeições no aplicativo.
        </div>
      )}
      {logs.length > 0 && (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.date} className="space-y-2">
              <h3 className="text-sm font-semibold">{group.date}</h3>
              {group.logs.map((log) => (
                <article key={log.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium">
                      {log.source === 'PLAN' ? planTitle(log) : log.freeText}
                    </p>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {formatTime(log.consumedAt)}
                    </time>
                  </div>
                  {log.note ? (
                    <p className="mt-1 text-sm text-muted-foreground">{log.note}</p>
                  ) : null}
                  {log.source === 'PLAN' && log.itemsJson && log.itemsJson.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {log.itemsJson.map((item, i) => (
                        <li key={`${log.id}-${i}`}>{foodLine(item)}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
