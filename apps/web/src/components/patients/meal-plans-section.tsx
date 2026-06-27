'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { MealPlanSummary } from '@nutri-plus/shared-types';
import { useGenerateMealPlan, useMealPlans } from '@/lib/queries/meal-plans';
import { missingFieldsFromError } from '@/lib/meal-plans/generate-error';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

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
  const generate = useGenerateMealPlan(patientId);
  const router = useRouter();
  const [missing, setMissing] = useState<string[] | null>(null);

  const plans = query.data ?? [];

  async function onGenerate() {
    setMissing(null);
    try {
      const plan = await generate.mutateAsync(patientId);
      router.push(`/patients/${patientId}/planos/${plan.id}`);
    } catch (err) {
      const fields = missingFieldsFromError(err);
      if (fields) {
        setMissing(fields);
      } else {
        toast.error('Não foi possível gerar o plano. Tente novamente.');
      }
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-bold">Planos alimentares</h2>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-full" asChild>
              <Link href={`/patients/${patientId}/planos/novo`}>Novo plano</Link>
            </Button>
            <Button
              size="sm"
              className="rounded-full"
              onClick={onGenerate}
              disabled={generate.isPending}
            >
              {generate.isPending ? 'Gerando…' : '✨ Gerar com IA'}
            </Button>
          </div>
        )}
      </div>

      {missing && (
        <div className="rounded-xl border border-destructive/40 bg-card p-4 text-sm">
          <p className="font-medium text-destructive">Complete o cadastro do paciente para gerar com IA.</p>
          <p className="mt-1 text-muted-foreground">Faltando: {missing.join(', ')}.</p>
        </div>
      )}

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
            <Link
              key={p.id}
              href={`/patients/${patientId}/planos/${p.id}`}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:bg-muted/40"
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
          ))}
        </div>
      )}
    </section>
  );
}
