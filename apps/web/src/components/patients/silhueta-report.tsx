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
import { toast } from 'sonner';
import type { SilhuetaScan } from '@nutri-plus/shared-types';
import { useApplySilhuetaScan, useSilhuetaScans } from '@/lib/queries/silhueta';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type ClassifiedMetric = 'imc' | 'bodyFatPercentage';
type Classification = 'Abaixo' | 'Normal' | 'Acima';
type HistoryMetric = Extract<keyof SilhuetaScan, 'weightKg' | 'bodyFatPercentage' | 'muscleMassPercentage'>;

// MVP generic bands — a deliberate simplification, NOT sex/age-specific.
// A real body-composition classification should account for sex, age and the
// measurement method used; these thresholds only give a rough, quick read.
const CLASSIFIED_BANDS: Record<ClassifiedMetric, { low: number; high: number }> = {
  imc: { low: 18.5, high: 25 },
  bodyFatPercentage: { low: 10, high: 25 },
};

// Visual range used only to position the value inside the bar (cosmetic).
const BAR_RANGE: Record<ClassifiedMetric, [number, number]> = {
  imc: [15, 35],
  bodyFatPercentage: [0, 40],
};

const CLASSIFICATION_BAR: Record<Classification, string> = {
  Abaixo: 'bg-amber-500',
  Normal: 'bg-emerald-500',
  Acima: 'bg-red-500',
};

const CLASSIFICATION_BADGE: Record<Classification, string> = {
  Abaixo: 'border-amber-500 text-amber-700 dark:text-amber-400',
  Normal: 'border-emerald-500 text-emerald-700 dark:text-emerald-400',
  Acima: 'border-red-500 text-red-700 dark:text-red-400',
};

const HISTORY_METRICS: { key: HistoryMetric; label: string }[] = [
  { key: 'weightKg', label: 'Peso' },
  { key: 'bodyFatPercentage', label: '% Gordura' },
  { key: 'muscleMassPercentage', label: 'Massa muscular (%)' },
];

function classify(metric: ClassifiedMetric, value: number): Classification {
  const { low, high } = CLASSIFIED_BANDS[metric];
  if (value < low) return 'Abaixo';
  if (value > high) return 'Acima';
  return 'Normal';
}

function fmtNum(value: number | null, decimals = 1): string {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function computeImc(scan: SilhuetaScan): number | null {
  if (scan.heightCm == null || scan.weightKg == null || scan.heightCm === 0) return null;
  const heightM = scan.heightCm / 100;
  return scan.weightKg / (heightM * heightM);
}

// Prefer the manually-entered waist/hip pair; only fall back to the
// photo-estimated circumferences when both come from that same source.
// We never mix an input value with an estimated circumference.
function computeWhr(scan: SilhuetaScan): number | null {
  if (scan.waistInput != null && scan.hipInput != null && scan.hipInput !== 0) {
    return scan.waistInput / scan.hipInput;
  }
  if (scan.waistCircumference != null && scan.hipCircumference != null && scan.hipCircumference !== 0) {
    return scan.waistCircumference / scan.hipCircumference;
  }
  return null;
}

function barFillPercent(metric: ClassifiedMetric | null, value: number): number {
  if (!metric) return 100;
  const [min, max] = BAR_RANGE[metric];
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

function MetricBar({
  label,
  value,
  metric,
  decimals = 1,
  unit = '',
}: {
  label: string;
  value: number | null;
  metric: ClassifiedMetric | null;
  decimals?: number;
  unit?: string;
}) {
  const classification = metric && value != null ? classify(metric, value) : null;
  const display = value == null ? '—' : `${fmtNum(value, decimals)}${unit}`;
  const fillPct = value == null ? 0 : barFillPercent(metric, value);
  const barColor = classification
    ? CLASSIFICATION_BAR[classification]
    : value == null
      ? 'bg-muted'
      : 'bg-muted-foreground/40';

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold">{display}</span>
          {classification && (
            <Badge variant="outline" className={CLASSIFICATION_BADGE[classification]}>
              {classification}
            </Badge>
          )}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${fillPct}%` }} />
      </div>
    </div>
  );
}

export function SilhuetaDisclaimers() {
  return (
    <div className="space-y-1 rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground">
      <p>
        • Os resultados são uma <strong>estimativa</strong> gerada por IA a partir das fotos, não
        uma medição direta.
      </p>
      <p>
        • Este recurso <strong>não é um método diagnóstico</strong> e não substitui avaliação
        clínica.
      </p>
      <p>
        • Os valores <strong>não são comparáveis</strong> a outros métodos (bioimpedância, DEXA
        etc.).
      </p>
      <p>
        • Compare apenas <strong>Silhueta com Silhueta</strong>: use para acompanhar a tendência do
        mesmo paciente ao longo do tempo.
      </p>
    </div>
  );
}

function ConceitosBlock() {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
      <h3 className="font-heading text-sm font-semibold">Conceitos</h3>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          <strong>IMC (Índice de Massa Corporal)</strong>: relação entre peso e altura; não
          diferencia massa magra de gordura corporal.
        </li>
        <li>
          <strong>% de gordura corporal</strong>: proporção estimada de gordura em relação ao peso
          total.
        </li>
        <li>
          <strong>Massa magra</strong>: tudo o que não é gordura (músculos, ossos, água, órgãos).
        </li>
        <li>
          <strong>Relação cintura/quadril (RCQ)</strong>: indicador da distribuição de gordura
          corporal.
        </li>
      </ul>
    </div>
  );
}

export function SilhuetaReport({ patientId, scan }: { patientId: string; scan: SilhuetaScan }) {
  const scansQuery = useSilhuetaScans(patientId);
  const applyMut = useApplySilhuetaScan(patientId);
  const [viewedId, setViewedId] = useState(scan.id);
  const [chartMetric, setChartMetric] = useState<HistoryMetric>('weightKg');
  // Scans already saved into the assessment history during this session, so we
  // can warn before creating a duplicate bioimpedance entry from the same scan.
  const [appliedIds, setAppliedIds] = useState<Set<string>>(() => new Set());

  const scans = scansQuery.data ?? [];
  const viewedScan = scans.find((s) => s.id === viewedId) ?? scan;
  const alreadyApplied = appliedIds.has(viewedScan.id);

  const imc = computeImc(viewedScan);
  const whr = computeWhr(viewedScan);

  const bars: { key: string; label: string; value: number | null; metric: ClassifiedMetric | null; decimals?: number; unit?: string }[] = [
    { key: 'weight', label: 'Peso', value: viewedScan.weightKg, metric: null, unit: ' kg' },
    { key: 'imc', label: 'IMC', value: imc, metric: 'imc' },
    {
      key: 'bodyFat',
      label: '% Gordura corporal',
      value: viewedScan.bodyFatPercentage,
      metric: 'bodyFatPercentage',
      unit: '%',
    },
    { key: 'fatMass', label: 'Massa gorda', value: viewedScan.fatMass, metric: null, unit: ' kg' },
    { key: 'whr', label: 'Relação cintura/quadril', value: whr, metric: null, decimals: 2 },
  ];

  // Chart series: chronological (oldest→newest), Silhueta scans only.
  const chartSeries = useMemo(
    () =>
      [...scans]
        .reverse()
        .filter((s) => s[chartMetric] != null)
        .map((s) => ({ date: fmtShort(s.scanDate), value: s[chartMetric] as number })),
    [scans, chartMetric],
  );

  async function onApply() {
    if (
      alreadyApplied &&
      !window.confirm(
        'Esta estimativa já foi salva na avaliação do paciente. Deseja salvar novamente e criar outro registro?',
      )
    ) {
      return;
    }
    try {
      await applyMut.mutateAsync(viewedScan.id);
      setAppliedIds((prev) => new Set(prev).add(viewedScan.id));
      toast.success('Avaliação atualizada com os dados do Silhueta.');
    } catch {
      toast.error('Não foi possível atualizar a avaliação do paciente.');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-sm font-semibold">
          Estimativa de {fmtDate(viewedScan.scanDate)}
        </h3>
        <p className="text-xs text-muted-foreground">
          Estimativa de composição corporal por foto — não substitui bioimpedância ou avaliação
          clínica.
        </p>
      </div>

      {/* Index bars */}
      <div className="grid gap-3 sm:grid-cols-2">
        {bars.map((bar) => (
          <MetricBar
            key={bar.key}
            label={bar.label}
            value={bar.value}
            metric={bar.metric}
            decimals={bar.decimals}
            unit={bar.unit}
          />
        ))}
      </div>

      <div className="flex flex-col items-end gap-1">
        {alreadyApplied && !applyMut.isPending && (
          <p className="text-xs font-medium text-primary">
            ✓ Já salvo na avaliação do paciente.
          </p>
        )}
        <Button
          className="rounded-full"
          variant={alreadyApplied ? 'outline' : 'default'}
          onClick={onApply}
          disabled={applyMut.isPending}
        >
          {applyMut.isPending
            ? 'Atualizando…'
            : alreadyApplied
              ? 'Salvar novamente'
              : 'Atualizar avaliação do paciente'}
        </Button>
      </div>

      {/* Silhueta-only history */}
      {scans.length > 0 && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <h3 className="font-heading text-sm font-semibold">Histórico Silhueta</h3>
          <div className="flex flex-wrap gap-2">
            {HISTORY_METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setChartMetric(m.key)}
                aria-pressed={chartMetric === m.key}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs',
                  chartMetric === m.key
                    ? 'border-primary bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          {chartSeries.length >= 2 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartSeries} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  stroke="var(--muted-foreground)"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  width={40}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--foreground)' }}
                  itemStyle={{ color: 'var(--foreground)' }}
                />
                <Line type="monotone" dataKey="value" stroke="#14BFA6" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Gere ao menos duas estimativas Silhueta para ver a evolução.
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Data</th>
                  <th className="px-4 py-2 font-semibold">Peso</th>
                  <th className="px-4 py-2 font-semibold">% Gord.</th>
                  <th className="px-4 py-2 font-semibold">% Músc.</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setViewedId(s.id)}
                    aria-current={viewedScan.id === s.id}
                    className={cn(
                      'cursor-pointer border-b last:border-0 hover:bg-muted/40',
                      viewedScan.id === s.id && 'bg-muted/60',
                    )}
                  >
                    <td className="px-4 py-2">{fmtDate(s.scanDate)}</td>
                    <td className="px-4 py-2">{fmtNum(s.weightKg)}</td>
                    <td className="px-4 py-2">{fmtNum(s.bodyFatPercentage)}</td>
                    <td className="px-4 py-2">{fmtNum(s.muscleMassPercentage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SilhuetaDisclaimers />
      <ConceitosBlock />
    </div>
  );
}
