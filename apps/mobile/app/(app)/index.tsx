import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { BodyAssessment } from '@nutri-plus/shared-types';
import { Screen } from '../../components/ui/screen';
import { BrandHeader } from '../../components/brand/brand-header';
import { Button } from '../../components/ui/button';
import { LineChart } from '../../components/chart/line-chart';
import { useMyEvolution, downloadEvolutionPdf } from '../../lib/queries/assessments';
import { useMyNutritionTarget } from '../../lib/queries/nutrition-target';

// pt-BR number with 1 decimal and comma; '—' for null/undefined.
function fmt(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(digits).replace('.', ',');
}

function bmi(weight: number | null, height: number | null): number | null {
  if (weight === null || height === null || height <= 0) return null;
  return weight / (height / 100) ** 2;
}

// ISO 'YYYY-MM-DD...' → 'DD/MM/YYYY' (tz-safe: no Date parsing).
function formatDate(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/');
}

type Metric = keyof Pick<BodyAssessment, 'weight' | 'bodyFatPercentage' | 'muscleMassPercentage'>;

// The headline metrics shown both as snapshot tiles and as trend charts.
const METRICS: { key: Metric; label: string; unit?: string; trendLabel: string }[] = [
  { key: 'weight', label: 'Peso', unit: 'kg', trendLabel: 'Peso (kg)' },
  { key: 'bodyFatPercentage', label: '% Gordura', unit: '%', trendLabel: '% Gordura' },
  { key: 'muscleMassPercentage', label: 'Massa muscular', unit: '%', trendLabel: 'Massa muscular (%)' },
];

// The full set of measurements available as a selectable trend chart, including
// a computed IMC series. Labels are chip-sized (the Detalhes grid keeps its own
// '(cm)'/'(%)' labels).
const CHART_METRICS = [
  { key: 'weight', label: 'Peso' },
  { key: 'imc', label: 'IMC' },
  { key: 'bodyFatPercentage', label: '% Gordura' },
  { key: 'muscleMassPercentage', label: 'Massa muscular' },
  { key: 'leanMassPercentage', label: 'Massa magra' },
  { key: 'visceralFat', label: 'Gordura visceral' },
  { key: 'basalMetabolicRate', label: 'TMB' },
  { key: 'bodyWaterPercentage', label: '% Água' },
  { key: 'boneMass', label: 'Massa óssea' },
  { key: 'metabolicAge', label: 'Idade metabólica' },
  { key: 'waistCircumference', label: 'Cintura' },
  { key: 'abdomenCircumference', label: 'Abdômen' },
  { key: 'hipCircumference', label: 'Quadril' },
  { key: 'thighCircumference', label: 'Coxa medial' },
  { key: 'armCircumference', label: 'Braço relaxado' },
  { key: 'contractedArmCircumference', label: 'Braço contraído' },
  { key: 'chestCircumference', label: 'Busto' },
  { key: 'calfCircumference', label: 'Panturrilha' },
] as const;

type ChartMetric = (typeof CHART_METRICS)[number]['key'];

// Builds a chronological {x,y} series for the selected metric. 'imc' is computed
// per assessment from weight + height; every other key reads the field directly.
// Null/undefined values are dropped and x is re-indexed over the remaining points.
function seriesFor(
  metric: ChartMetric,
  assessments: BodyAssessment[],
  height: number | null,
): { x: number; y: number }[] {
  const valueOf = (a: BodyAssessment): number | null =>
    metric === 'imc' ? bmi(a.weight, height) : (a[metric] as number | null);
  return assessments
    .map(valueOf)
    .filter((y): y is number => y !== null && y !== undefined)
    .map((y, i) => ({ x: i, y }));
}

function Tile({ label, value, unit, delta }: { label: string; value: string; unit?: string; delta: number | null }) {
  return (
    <View className="min-w-[45%] flex-1 gap-1 rounded-xl border border-border bg-card p-3">
      <Text className="font-sans text-sm text-muted-foreground">{label}</Text>
      <Text className="font-heading text-xl text-foreground">
        {value}
        {unit ? <Text className="font-sans text-sm text-muted-foreground"> {unit}</Text> : null}
      </Text>
      {delta !== null ? (
        <Text className="font-sans text-xs text-primary">
          {delta >= 0 ? '▲' : '▼'} {fmt(Math.abs(delta))}
        </Text>
      ) : null}
    </View>
  );
}

function Trend({ label, points }: { label: string; points: { x: number; y: number }[] }) {
  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-3">
      <Text className="font-sans text-sm text-muted-foreground">{label}</Text>
      {points.length >= 2 ? (
        <LineChart data={points} />
      ) : (
        <Text className="font-sans text-xs text-muted-foreground">Sem histórico suficiente para tendência ainda.</Text>
      )}
    </View>
  );
}

function GridRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between border-b border-border py-2">
      <Text className="font-sans text-sm text-muted-foreground">{label}</Text>
      <Text className="font-sans text-sm text-foreground">{value}</Text>
    </View>
  );
}

export default function Home() {
  const query = useMyEvolution();
  const targetQuery = useMyNutritionTarget();
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<ChartMetric>('weight');

  async function onExport() {
    setPdfError(null);
    setDownloading(true);
    try {
      await downloadEvolutionPdf();
    } catch {
      setPdfError('Não foi possível baixar o PDF. Tente novamente.');
    } finally {
      setDownloading(false);
    }
  }

  if (query.isLoading) {
    return (
      <View testID="evolution-loading" className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#14bfa6" />
      </View>
    );
  }

  if (query.isError) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="font-sans text-center text-base text-muted-foreground">
          Não foi possível carregar sua evolução.
        </Text>
        <Button label="Tentar de novo" onPress={() => query.refetch()} />
      </View>
    );
  }

  const { name, height, assessments, canLog } = query.data!;

  if (assessments.length === 0) {
    return (
      <Screen header={<BrandHeader />} contentContainerClassName="grow justify-center p-6">
        <View className="items-center gap-2">
          <Text className="font-heading text-2xl text-foreground">Olá, {name}</Text>
          <Text className="font-sans text-center text-base text-muted-foreground">
            Suas avaliações aparecerão aqui após sua consulta.
          </Text>
          {canLog ? (
            <Button label="Registrar medição" onPress={() => router.push('/nova-medicao')} />
          ) : null}
        </View>
      </Screen>
    );
  }

  const latest = assessments.at(-1)!;
  const previous = assessments.length >= 2 ? assessments.at(-2)! : null;

  const deltaOf = (key: keyof BodyAssessment): number | null => {
    const cur = latest[key];
    const prev = previous ? previous[key] : null;
    return typeof cur === 'number' && typeof prev === 'number' ? cur - prev : null;
  };

  const curBmi = bmi(latest.weight, height);
  const prevBmi = previous ? bmi(previous.weight, height) : null;
  const bmiDelta = curBmi !== null && prevBmi !== null ? curBmi - prevBmi : null;

  const chartPoints = seriesFor(selectedMetric, assessments, height);
  const chartLabel = CHART_METRICS.find((m) => m.key === selectedMetric)!.label;

  const grid: { label: string; value: string }[] = [
    { label: 'Massa magra (%)', value: fmt(latest.leanMassPercentage) },
    { label: 'Gordura visceral', value: fmt(latest.visceralFat, 0) },
    { label: 'Taxa metabólica basal', value: fmt(latest.basalMetabolicRate, 0) },
    { label: 'Água corporal (%)', value: fmt(latest.bodyWaterPercentage) },
    { label: 'Massa óssea (kg)', value: fmt(latest.boneMass) },
    { label: 'Idade metabólica', value: fmt(latest.metabolicAge, 0) },
    { label: 'Cintura (cm)', value: fmt(latest.waistCircumference) },
    { label: 'Abdômen (cm)', value: fmt(latest.abdomenCircumference) },
    { label: 'Quadril (cm)', value: fmt(latest.hipCircumference) },
    { label: 'Coxa medial (cm)', value: fmt(latest.thighCircumference) },
    { label: 'Braço relaxado (cm)', value: fmt(latest.armCircumference) },
    { label: 'Braço contraído (cm)', value: fmt(latest.contractedArmCircumference) },
    { label: 'Busto (cm)', value: fmt(latest.chestCircumference) },
    { label: 'Panturrilha (cm)', value: fmt(latest.calfCircumference) },
  ];

  return (
    <Screen header={<BrandHeader />} contentContainerClassName="grow p-6">
      <View className="gap-6">
        <View className="gap-1">
          <Text className="font-heading text-2xl text-foreground">Olá, {name}</Text>
          <Text className="font-sans text-base text-muted-foreground">Sua evolução</Text>
        </View>

        {targetQuery.data ? (
          <View className="gap-2 rounded-xl border border-border bg-card p-4">
            <Text className="font-sans text-sm text-muted-foreground">Sua meta diária</Text>
            <Text className="font-heading text-2xl text-foreground">
              {targetQuery.data.targetCalories.toLocaleString('pt-BR')} kcal
            </Text>
            <View className="flex-row flex-wrap gap-x-4 gap-y-1">
              <Text className="font-sans text-sm text-foreground">Proteína {targetQuery.data.proteinGrams} g</Text>
              <Text className="font-sans text-sm text-foreground">Carboidrato {targetQuery.data.carbGrams} g</Text>
              <Text className="font-sans text-sm text-foreground">Gordura {targetQuery.data.fatGrams} g</Text>
            </View>
          </View>
        ) : null}

        <View className="gap-2">
          <Text className="font-sans text-sm text-muted-foreground">
            Última avaliação · {formatDate(latest.assessmentDate)}
          </Text>
          {latest.estimatedFromPhoto ? (
            <Text className="self-start rounded-full bg-primary/10 px-2 py-0.5 font-sans text-xs font-semibold text-primary">
              Estimado por foto
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-3">
            {METRICS.map((m) => (
              <Tile key={m.key} label={m.label} value={fmt(latest[m.key])} unit={m.unit} delta={deltaOf(m.key)} />
            ))}
            <Tile label="IMC" value={fmt(curBmi)} delta={bmiDelta} />
          </View>
        </View>

        <View className="gap-3">
          <Text className="font-heading text-lg text-foreground">Tendências</Text>
          <View className="flex-row flex-wrap gap-2">
            {CHART_METRICS.map((m) => {
              const selected = m.key === selectedMetric;
              return (
                <Pressable
                  key={m.key}
                  accessibilityRole="button"
                  onPress={() => setSelectedMetric(m.key)}
                  className={`rounded-full border px-3 py-1 ${
                    selected ? 'border-primary bg-primary' : 'border-border bg-card'
                  }`}
                >
                  <Text
                    className={`font-sans text-xs ${
                      selected ? 'text-primary-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Trend label={chartLabel} points={chartPoints} />
        </View>

        <View className="gap-1">
          <Text className="font-heading text-lg text-foreground">Detalhes da última avaliação</Text>
          {grid.map((row) => (
            <GridRow key={row.label} label={row.label} value={row.value} />
          ))}
        </View>

        {pdfError ? <Text className="font-sans text-sm text-destructive">{pdfError}</Text> : null}
        <Button label="Exportar PDF" onPress={onExport} loading={downloading} />

        {canLog ? (
          <Button label="Registrar medição" onPress={() => router.push('/nova-medicao')} />
        ) : null}
      </View>
    </Screen>
  );
}
