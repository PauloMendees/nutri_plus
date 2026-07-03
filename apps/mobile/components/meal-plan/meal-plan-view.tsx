import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Screen } from '../ui/screen';
import { Button } from '../ui/button';
import { useMyMealPlan, downloadMealPlanPdf } from '../../lib/queries/meal-plans';

function fmt(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : String(v);
}

export function MealPlanView({ planId }: { planId: string }) {
  const query = useMyMealPlan(planId);
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  if (query.isLoading) {
    return (
      <View testID="meal-plan-loading" className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#14bfa6" />
      </View>
    );
  }
  if (query.isError || !query.data) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="font-sans text-center text-base text-muted-foreground">
          Não foi possível carregar o plano.
        </Text>
        <Button label="Tentar de novo" onPress={() => query.refetch()} />
      </View>
    );
  }

  const plan = query.data;

  async function onDownload() {
    setPdfError(null);
    setDownloading(true);
    try {
      await downloadMealPlanPdf(planId);
    } catch {
      setPdfError('Não foi possível baixar o PDF. Tente novamente.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Screen contentContainerClassName="grow p-6">
      <View className="gap-6">
        <View className="gap-1">
          <Text className="font-heading text-2xl text-foreground">{plan.title ?? 'Plano alimentar'}</Text>
          {plan.objective ? (
            <Text className="font-sans text-base text-muted-foreground">{plan.objective}</Text>
          ) : null}
          {plan.targetCalories != null ? (
            <Text className="font-sans text-sm text-muted-foreground">
              Metas: {fmt(plan.targetCalories)} kcal · P {fmt(plan.targetProtein)}g · C {fmt(plan.targetCarbs)}g · G {fmt(plan.targetFats)}g
            </Text>
          ) : null}
        </View>

        {plan.meals.map((meal) => (
          <View key={meal.id} className="gap-2 rounded-xl border border-border bg-card p-4">
            <Text className="font-heading-semibold text-lg text-foreground">
              {meal.timeLabel ? <Text>{`${meal.timeLabel} · `}</Text> : null}
              <Text>{meal.name ?? 'Refeição'}</Text>
            </Text>
            {meal.instructions ? (
              <Text className="font-sans text-sm text-muted-foreground">{meal.instructions}</Text>
            ) : null}
            {meal.options.map((opt) => (
              <View key={opt.id} className="gap-1 border-t border-border pt-2">
                {opt.label ? (
                  <Text className="font-sans-medium text-sm text-primary">{opt.label}</Text>
                ) : null}
                {opt.items.map((it) => (
                  <View key={it.id} className="flex-row justify-between">
                    <Text className="font-sans text-sm text-foreground">
                      <Text>{it.foodName ?? '—'}</Text>
                      {it.quantity ? <Text>{` · ${it.quantity}`}</Text> : null}
                    </Text>
                    {it.calories != null ? (
                      <Text className="font-sans text-xs text-muted-foreground">{fmt(it.calories)} kcal</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}

        {pdfError ? <Text className="font-sans text-sm text-destructive">{pdfError}</Text> : null}
        <Button label="Baixar PDF" onPress={onDownload} loading={downloading} />
      </View>
    </Screen>
  );
}
