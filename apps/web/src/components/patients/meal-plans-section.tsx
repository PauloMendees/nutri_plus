'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { MealPlanSummary } from '@nutri-plus/shared-types';
import { useMealPlans, useSetMealPlanVisibility } from '@/lib/queries/meal-plans';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AiGenerateDialog } from '@/components/patients/ai-generate-dialog';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function MealPlansSection({
  patientId,
  canEdit = true,
}: {
  patientId: string;
  canEdit?: boolean;
}) {
  const query = useMealPlans(patientId);
  const visibility = useSetMealPlanVisibility(patientId);
  const [generating, setGenerating] = useState(false);

  const plans = query.data ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-bold">Planos alimentares</h2>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button
              className="rounded-full shadow-sm shadow-primary/30"
              onClick={() => setGenerating(true)}
            >
              ✨ Gerar com IA
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" asChild>
              <Link href={`/patients/${patientId}/planos/novo`}>Novo plano</Link>
            </Button>
          </div>
        )}
      </div>

      {query.isLoading && (
        <div data-testid="meal-plans-loading" className="rounded-xl border bg-card p-4">
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {query.isError && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar os planos.{' '}
          <button onClick={() => query.refetch()} className="font-semibold text-primary hover:underline">
            Tentar de novo
          </button>
        </div>
      )}

      {query.data && plans.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="font-medium">Nenhum plano ainda</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Crie um plano manualmente ou gere um com IA a partir dos dados do paciente.
          </p>
        </div>
      )}

      {plans.length > 0 && (
        <div className="space-y-2">
          {plans.map((p: MealPlanSummary) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:bg-muted/40"
            >
              <Link
                href={`/patients/${patientId}/planos/${p.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.title ?? 'Sem título'}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {p.objective ?? '—'} · {formatDate(p.createdAt)}
                    {p.targetCalories != null && ` · ${p.targetCalories} kcal`}
                  </span>
                </span>
                {p.aiGenerated && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-secondary-foreground">
                    IA
                  </span>
                )}
              </Link>
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant={p.visibleToPatient ? 'default' : 'outline'}
                  className="shrink-0 rounded-full"
                  disabled={visibility.isPending}
                  onClick={() => visibility.mutate({ id: p.id, visibleToPatient: !p.visibleToPatient })}
                >
                  {p.visibleToPatient ? 'Disponível ✓' : 'Disponibilizar'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <AiGenerateDialog
          open={generating}
          onOpenChange={(o) => !o && setGenerating(false)}
          patientId={patientId}
        />
      )}
    </section>
  );
}
