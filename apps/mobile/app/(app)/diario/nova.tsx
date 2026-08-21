import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { CreateMealLogRequest } from '@nutri-plus/shared-types';
import { Screen } from '../../../components/ui/screen';
import { Button } from '../../../components/ui/button';
import { MealLogForm } from '../../../components/meal-diary/meal-log-form';
import { ApiError } from '../../../lib/api';
import { useCreateMealLog } from '../../../lib/queries/meal-logs';
import { useMyMealPlan, useMyMealPlans } from '../../../lib/queries/meal-plans';

const LOCK_MESSAGE = 'Só é possível editar ou apagar uma refeição nas primeiras 24 horas.';

function mutationErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 403) return LOCK_MESSAGE;
  return 'Não foi possível salvar. Tente novamente.';
}

export default function DiarioNova() {
  const plansQuery = useMyMealPlans();
  const plans = plansQuery.data ?? [];
  const latest = plans[0];
  const planQuery = useMyMealPlan(latest?.id ?? '');
  const create = useCreateMealLog();
  const [formError, setFormError] = useState<string | null>(null);

  if (plansQuery.isLoading || (latest && planQuery.isLoading)) {
    return (
      <View testID="meal-diary-form-loading" className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#14bfa6" />
      </View>
    );
  }

  if (plansQuery.isError || (latest && (planQuery.isError || !planQuery.data))) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="font-sans text-center text-base text-muted-foreground">
          Não foi possível carregar seu diário.
        </Text>
        <Button
          label="Tentar de novo"
          onPress={() => {
            void plansQuery.refetch();
            void planQuery.refetch();
          }}
        />
      </View>
    );
  }

  async function onSubmit(body: CreateMealLogRequest) {
    setFormError(null);
    try {
      await create.mutateAsync(body);
      router.back();
    } catch (err) {
      setFormError(mutationErrorMessage(err));
    }
  }

  return (
    <Screen contentContainerClassName="grow p-6">
      <View className="gap-6">
        <Text className="font-heading text-2xl text-foreground">Registrar refeição</Text>
        <MealLogForm
          plans={plans}
          plan={planQuery.data ?? null}
          submitting={create.isPending}
          onSubmit={(body) => void onSubmit(body)}
        />
        {formError ? <Text className="font-sans text-sm text-destructive">{formError}</Text> : null}
      </View>
    </Screen>
  );
}
