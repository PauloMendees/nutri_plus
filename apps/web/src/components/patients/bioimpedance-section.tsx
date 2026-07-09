'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BodyAssessment } from '@nutri-plus/shared-types';
import { Smartphone } from 'lucide-react';
import { useAssessments } from '@/lib/queries/assessments';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AssessmentDialog } from '@/components/patients/assessment-dialog';

type MetricKey = Extract<
  keyof BodyAssessment,
  | 'weight'
  | 'bodyFatPercentage'
  | 'muscleMass'
  | 'leanMass'
  | 'visceralFat'
  | 'basalMetabolicRate'
  | 'bodyWaterPercentage'
  | 'waistCircumference'
  | 'hipCircumference'
>;

const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'weight', label: 'Peso' },
  { key: 'bodyFatPercentage', label: '% Gordura' },
  { key: 'muscleMass', label: 'Massa muscular' },
  { key: 'leanMass', label: 'Massa magra' },
  { key: 'visceralFat', label: 'Gordura visceral' },
  { key: 'basalMetabolicRate', label: 'TMB' },
  { key: 'bodyWaterPercentage', label: '% Água' },
  { key: 'waistCircumference', label: 'Cintura' },
  { key: 'hipCircumference', label: 'Quadril' },
];

const SUMMARY: { key: MetricKey; label: string }[] = [
  { key: 'weight', label: 'Peso (kg)' },
  { key: 'bodyFatPercentage', label: '% Gordura' },
  { key: 'leanMass', label: 'Massa magra' },
  { key: 'basalMetabolicRate', label: 'TMB' },
];

function fmt(n: number | null): string {
  return n == null ? '—' : n.toLocaleString('pt-BR');
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}
function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function BioimpedanceSection({
  patientId,
  canEdit = true,
}: {
  patientId: string;
  canEdit?: boolean;
}) {
  const query = useAssessments(patientId);
  const [metric, setMetric] = useState<MetricKey>('weight');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BodyAssessment | null>(null);

  const data = query.data ?? [];
  const latest = data[0];

  // Chart series: chronological (oldest→newest), only points where the metric exists.
  const series = useMemo(
    () =>
      [...data]
        .reverse()
        .filter((a) => a[metric] != null)
        .map((a) => ({ date: fmtShort(a.assessmentDate), value: a[metric] as number })),
    [data, metric],
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-bold">Bioimpedância</h2>
        {canEdit && (
          <Button size="sm" className="rounded-full" onClick={() => setCreating(true)}>
            Nova avaliação
          </Button>
        )}
      </div>

      {query.isLoading && (
        <div data-testid="bio-loading" className="space-y-2 rounded-xl border bg-card p-4">
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {query.isError && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar as avaliações.{' '}
          <button onClick={() => query.refetch()} className="font-semibold text-primary hover:underline">
            Tentar de novo
          </button>
        </div>
      )}

      {query.data && data.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="font-medium">Nenhuma avaliação ainda</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Registre a bioimpedância do paciente para acompanhar a evolução.
          </p>
          {canEdit && (
            <Button className="rounded-full" onClick={() => setCreating(true)}>
              Registrar avaliação
            </Button>
          )}
        </div>
      )}

      {latest && (
        <>
          {/* Summary cards (latest) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SUMMARY.map((m) => (
              <div key={m.key} className="rounded-xl border bg-card p-3 text-center">
                <p className="text-lg font-bold">{fmt(latest[m.key])}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Trend chart */}
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMetric(m.key)}
                  aria-pressed={metric === m.key}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs',
                    metric === m.key
                      ? 'border-primary bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {series.length >= 2 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" fontSize={11} stroke="var(--muted-foreground)" />
                  <YAxis fontSize={11} stroke="var(--muted-foreground)" width={40} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#14BFA6" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Registre ao menos duas avaliações com esta métrica para ver a evolução.
              </p>
            )}
          </div>

          {/* History table */}
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Peso</th>
                  <th className="px-4 py-3 font-semibold">% Gord.</th>
                  <th className="px-4 py-3 font-semibold">Músculo</th>
                  <th className="px-4 py-3 font-semibold">Magra</th>
                  <th className="px-4 py-3 font-semibold">Cintura</th>
                  {canEdit && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {data.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        {a.loggedByPatient && (
                          <TooltipProvider>
                            <UiTooltip>
                              <TooltipTrigger asChild>
                                <span
                                  aria-label="Registrado pelo paciente"
                                  className="text-muted-foreground"
                                >
                                  <Smartphone className="h-3.5 w-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Registrado pelo paciente pelo app</TooltipContent>
                            </UiTooltip>
                          </TooltipProvider>
                        )}
                        {fmtDate(a.assessmentDate)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{fmt(a.weight)}</td>
                    <td className="px-4 py-3">{fmt(a.bodyFatPercentage)}</td>
                    <td className="px-4 py-3">{fmt(a.muscleMass)}</td>
                    <td className="px-4 py-3">{fmt(a.leanMass)}</td>
                    <td className="px-4 py-3">{fmt(a.waistCircumference)}</td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setEditing(a)}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AssessmentDialog
        open={creating}
        onOpenChange={(o) => !o && setCreating(false)}
        patientId={patientId}
      />
      {editing && (
        <AssessmentDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          patientId={patientId}
          assessment={editing}
        />
      )}
    </section>
  );
}
