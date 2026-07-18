'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  ActivityLevel,
  Gender,
  TmbFormula,
  ageFromBirthDate,
  computeGet,
  computeMacros,
  computeTmb,
  suggestedCalories,
  type PatientDetail,
} from '@nutri-plus/shared-types';
import { ACTIVITY_LABELS, GENDER_LABELS, OBJECTIVE_LABELS } from '@/lib/patients/labels';
import { useCreateNutritionTarget, useNutritionTargets } from '@/lib/queries/nutrition-targets';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const FORMULA_LABELS: Record<TmbFormula, string> = {
  [TmbFormula.MIFFLIN]: 'Mifflin-St Jeor',
  [TmbFormula.HARRIS_BENEDICT]: 'Harris-Benedict',
  [TmbFormula.KATCH_MCARDLE]: 'Katch-McArdle (usa % de gordura)',
};

// Matches the Input component's styling — no native <select> primitive exists
// in the UI kit, and a plain <option disabled> is required for the Katch gate.
const SELECT_CLASS =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

type FormValues = {
  formula: TmbFormula;
  sex: Gender | '';
  age: number | '';
  heightCm: number | '';
  weightKg: number | '';
  bodyFatPercentage: number | '';
  activityLevel: ActivityLevel | '';
  targetCalories: number | '';
  proteinGramsPerKg: number | '';
  fatPercent: number | '';
};

function defaults(patient: PatientDetail): FormValues {
  const assessment = patient.assessments[0];
  const sex =
    patient.gender === Gender.MALE || patient.gender === Gender.FEMALE ? patient.gender : '';
  const age = ageFromBirthDate(patient.birthDate);
  return {
    formula: TmbFormula.MIFFLIN,
    sex,
    age: age ?? '',
    heightCm: patient.height ?? '',
    weightKg: assessment?.weight ?? '',
    bodyFatPercentage: assessment?.bodyFatPercentage ?? '',
    activityLevel: patient.activityLevel ?? '',
    targetCalories: '',
    proteinGramsPerKg: 1.8,
    fatPercent: 25,
  };
}

function fmt(n: number | null): string {
  return n == null ? '—' : Math.round(n).toLocaleString('pt-BR');
}

export function NutritionTargetsSection({ patient }: { patient: PatientDetail }) {
  const history = useNutritionTargets(patient.id);
  const create = useCreateNutritionTarget(patient.id);

  const form = useForm<FormValues>({ defaultValues: defaults(patient) });
  const { control, watch, setValue } = form;

  useEffect(() => {
    form.reset(defaults(patient));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

  const formula = watch('formula');
  const sex = watch('sex');
  const age = Number(watch('age'));
  const weightKg = Number(watch('weightKg'));
  const heightCm = Number(watch('heightCm'));
  const bfRaw = watch('bodyFatPercentage');
  const bf = bfRaw === '' || bfRaw == null ? null : Number(bfRaw);
  const activityLevel = watch('activityLevel');
  const targetCaloriesRaw = watch('targetCalories');
  const targetCalories =
    targetCaloriesRaw === '' || targetCaloriesRaw == null ? 0 : Number(targetCaloriesRaw);
  const proteinGramsPerKg = Number(watch('proteinGramsPerKg'));
  const fatPercent = Number(watch('fatPercent'));

  // Sex is only asked when the patient's registered gender doesn't resolve to a
  // biological sex the TMB formulas can use — otherwise it's silently prefilled.
  const needsSexPick = patient.gender !== Gender.MALE && patient.gender !== Gender.FEMALE;

  const canComputeTmb = Boolean(sex) && weightKg > 0 && heightCm > 0 && age > 0;
  const tmb = canComputeTmb
    ? computeTmb({ formula, sex: sex as Gender, weightKg, heightCm, age, bodyFatPercentage: bf })
    : null;
  const get = tmb != null && activityLevel ? computeGet(tmb, activityLevel as ActivityLevel) : null;
  const suggestion = get != null ? Math.round(suggestedCalories(get, patient.objective)) : null;

  const macros =
    targetCalories > 0 && weightKg > 0
      ? computeMacros({ targetCalories, weightKg, proteinGramsPerKg, fatPercent })
      : null;
  const macrosOver =
    macros != null &&
    macros.carbGrams === 0 &&
    targetCalories - macros.proteinKcal - macros.fatKcal < 0;

  function onUseSuggestion() {
    if (suggestion != null) setValue('targetCalories', suggestion, { shouldDirty: true });
  }

  async function onSave() {
    try {
      await create.mutateAsync({
        formula,
        sex: sex as Gender,
        age,
        heightCm,
        weightKg,
        bodyFatPercentage: bf ?? undefined,
        activityLevel: (activityLevel || undefined) as ActivityLevel | undefined,
        targetCalories,
        proteinGramsPerKg,
        fatPercent,
      });
      toast.success('Meta salva.');
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? 'Não foi possível salvar a meta.'
          : 'Erro inesperado ao salvar a meta.',
      );
    }
  }

  const canSave = Boolean(sex) && weightKg > 0 && heightCm > 0 && age > 0 && targetCalories > 0;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-base font-bold">Metas nutricionais</h2>
        <p className="text-sm text-muted-foreground">
          Calcule a TMB e o GET do paciente e defina metas de calorias e macronutrientes.
        </p>
      </div>

      <Form {...form}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              control={control}
              name="formula"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fórmula da TMB</FormLabel>
                  <FormControl>
                    <select {...field} className={SELECT_CLASS}>
                      <option value={TmbFormula.MIFFLIN}>{FORMULA_LABELS[TmbFormula.MIFFLIN]}</option>
                      <option value={TmbFormula.HARRIS_BENEDICT}>
                        {FORMULA_LABELS[TmbFormula.HARRIS_BENEDICT]}
                      </option>
                      <option value={TmbFormula.KATCH_MCARDLE} disabled={bf == null}>
                        {FORMULA_LABELS[TmbFormula.KATCH_MCARDLE]}
                      </option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {needsSexPick ? (
              <FormField
                control={control}
                name="sex"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sexo (para o cálculo)</FormLabel>
                    <FormControl>
                      <select {...field} className={SELECT_CLASS}>
                        <option value="">Selecione</option>
                        <option value={Gender.MALE}>{GENDER_LABELS[Gender.MALE]}</option>
                        <option value={Gender.FEMALE}>{GENDER_LABELS[Gender.FEMALE]}</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="flex flex-col justify-end pb-2">
                <p className="text-xs text-muted-foreground">
                  Sexo considerado no cálculo:{' '}
                  <span className="font-medium text-foreground">{GENDER_LABELS[sex as Gender]}</span>
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <FormField
              control={control}
              name="age"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Idade</FormLabel>
                  <FormControl>
                    <Input type="number" inputMode="numeric" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="heightCm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Altura (cm)</FormLabel>
                  <FormControl>
                    <Input type="number" inputMode="decimal" step="any" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="weightKg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Peso (kg)</FormLabel>
                  <FormControl>
                    <Input type="number" inputMode="decimal" step="any" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="bodyFatPercentage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>% Gordura (opcional)</FormLabel>
                  <FormControl>
                    <Input type="number" inputMode="decimal" step="any" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={control}
            name="activityLevel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nível de atividade</FormLabel>
                <FormControl>
                  <select {...field} className={SELECT_CLASS}>
                    <option value="">Selecione</option>
                    {Object.values(ActivityLevel).map((a) => (
                      <option key={a} value={a}>
                        {ACTIVITY_LABELS[a]}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Live TMB / GET / suggestion */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="text-lg font-bold" data-testid="nt-tmb-value">
                {fmt(tmb)}
              </p>
              <p className="text-xs text-muted-foreground">TMB (kcal)</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="text-lg font-bold" data-testid="nt-get-value">
                {fmt(get)}
              </p>
              <p className="text-xs text-muted-foreground">GET (kcal)</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="text-lg font-bold">{fmt(suggestion)}</p>
              <p className="text-xs text-muted-foreground">
                Sugestão{patient.objective ? ` · ${OBJECTIVE_LABELS[patient.objective]}` : ''}
              </p>
            </div>
          </div>

          {suggestion != null && (
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onUseSuggestion}>
                Usar sugestão
              </Button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              control={control}
              name="targetCalories"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meta calórica (kcal)</FormLabel>
                  <FormControl>
                    <Input type="number" inputMode="decimal" step="any" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="proteinGramsPerKg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proteína (g/kg)</FormLabel>
                  <FormControl>
                    <Input type="number" inputMode="decimal" step="any" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="fatPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gordura (% das kcal)</FormLabel>
                  <FormControl>
                    <Input type="number" inputMode="decimal" step="any" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {macros && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border bg-card p-3 text-center">
                <p className="text-lg font-bold">{macros.proteinGrams}g</p>
                <p className="text-xs text-muted-foreground">Proteína · {macros.proteinKcal} kcal</p>
              </div>
              <div className="rounded-xl border bg-card p-3 text-center">
                <p className="text-lg font-bold">{macros.carbGrams}g</p>
                <p className="text-xs text-muted-foreground">Carboidrato · {macros.carbKcal} kcal</p>
              </div>
              <div className="rounded-xl border bg-card p-3 text-center">
                <p className="text-lg font-bold">{macros.fatGrams}g</p>
                <p className="text-xs text-muted-foreground">Gordura · {macros.fatKcal} kcal</p>
              </div>
            </div>
          )}
          {macrosOver && (
            <p className="text-sm text-destructive">Proteína + gordura excedem o total</p>
          )}

          <div className="flex justify-end">
            <Button type="button" className="rounded-full" onClick={onSave} disabled={!canSave || create.isPending}>
              {create.isPending ? 'Salvando…' : 'Salvar meta'}
            </Button>
          </div>
        </div>
      </Form>

      <div className="space-y-2">
        <h3 className="font-heading text-sm font-semibold">Histórico de metas</h3>
        {history.isLoading && (
          <div className="rounded-xl border bg-card p-4">
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {!history.isLoading && (history.data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma meta registrada ainda.</p>
        )}
        {(history.data?.length ?? 0) > 0 && (
          <ul className="space-y-2">
            {history.data?.map((t) => (
              <li key={t.id} className="rounded-xl border bg-card p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{new Date(t.targetDate).toLocaleDateString('pt-BR')}</span>
                  <span className="text-xs text-muted-foreground">{FORMULA_LABELS[t.formula]}</span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {Math.round(t.targetCalories).toLocaleString('pt-BR')} kcal — P {t.proteinGrams}g · C{' '}
                  {t.carbGrams}g · G {t.fatGrams}g
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
