'use client';

import Link from 'next/link';
import type { FoodRecallSummary } from '@nutri-plus/shared-types';
import { useFoodRecalls } from '@/lib/queries/food-recalls';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function RecordatorioSection({
  patientId,
  canEdit = true,
}: {
  patientId: string;
  canEdit?: boolean;
}) {
  const query = useFoodRecalls(patientId);
  const recalls = query.data ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="font-heading text-base font-bold">Recordatórios 24h</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Sobre o recordatório 24h"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                O recordatório 24h registra tudo o que o paciente comeu e bebeu nas últimas 24 horas,
                com horários e quantidades. Serve para entender o consumo real e apoiar a montagem do
                plano alimentar.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" className="rounded-full" asChild>
            <Link href={`/patients/${patientId}/recordatorios/novo`} data-tour="patients.recall.new">
              Novo recordatório
            </Link>
          </Button>
        )}
      </div>

      {query.isLoading && (
        <div data-testid="recalls-loading" className="rounded-xl border bg-card p-4">
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
      {query.data && recalls.length === 0 && (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum recordatório ainda.
        </div>
      )}
      {recalls.length > 0 && (
        <div className="space-y-2">
          {recalls.map((r: FoodRecallSummary) => (
            <Link
              key={r.id}
              href={`/patients/${patientId}/recordatorios/${r.id}`}
              className="flex items-center justify-between rounded-xl border bg-card p-4 hover:bg-muted/40"
            >
              <span className="font-medium">{formatDate(r.recallDate)}</span>
              {r.notes ? <span className="truncate text-sm text-muted-foreground">{r.notes}</span> : null}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
