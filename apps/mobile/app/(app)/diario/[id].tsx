import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { CreateMealLogRequest, MealLog } from '@nutri-plus/shared-types';
import { Screen } from '../../../components/ui/screen';
import { Button } from '../../../components/ui/button';
import { formatLocalDate, formatLocalTime, MealLogForm } from '../../../components/meal-diary/meal-log-form';
import { ApiError } from '../../../lib/api';
import { useDeleteMealLog, useMyMealLogs, useUpdateMealLog } from '../../../lib/queries/meal-logs';
import { useMyMealPlan, useMyMealPlans } from '../../../lib/queries/meal-plans';

const LOCK_MESSAGE = 'Só é possível editar ou apagar uma refeição nas primeiras 24 horas.';

function logTitle(log: MealLog): string {
  return log.source === 'PLAN'
    ? `${log.mealName ?? 'Refeição'} · ${log.optionLabel ?? 'Opção'}`
    : (log.freeText ?? '');
}

function mutationErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 403) return LOCK_MESSAGE;
  return 'Não foi possível salvar. Tente novamente.';
}

export default function DiarioEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const logId = Array.isArray(id) ? id[0] : id;
  const logsQuery = useMyMealLogs();
  const plansQuery = useMyMealPlans();
  const plans = plansQuery.data ?? [];
  const latest = plans[0];
  const planQuery = useMyMealPlan(latest?.id ?? '');
  const update = useUpdateMealLog();
  const remove = useDeleteMealLog();
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (logsQuery.isLoading) {
    return (
      <View testID="meal-diary-log-loading" className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#14bfa6" />
      </View>
    );
  }

  if (logsQuery.isError || !logsQuery.data) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="font-sans text-center text-base text-muted-foreground">
          Não foi possível carregar seu diário.
        </Text>
        <Button label="Tentar de novo" onPress={() => logsQuery.refetch()} />
      </View>
    );
  }

  const found = logsQuery.data.find((row) => row.id === logId);
  if (!found) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="font-sans text-center text-base text-muted-foreground">
          Não foi possível carregar seu diário.
        </Text>
        <Button label="Tentar de novo" onPress={() => logsQuery.refetch()} />
      </View>
    );
  }

  const log: MealLog = found;
  const locked = Date.parse(log.editableUntil) <= Date.now();

  function alertLocked() {
    Alert.alert('Diário', LOCK_MESSAGE);
  }

  function confirmDelete() {
    Alert.alert('Diário', 'Apagar esta refeição?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          void remove
            .mutateAsync(log.id)
            .then(() => router.back())
            .catch((err: unknown) => setFormError(mutationErrorMessage(err)));
        },
      },
    ]);
  }

  async function onSubmit(body: CreateMealLogRequest) {
    setFormError(null);
    try {
      await update.mutateAsync({ id: log.id, body });
      router.back();
    } catch (err) {
      setFormError(mutationErrorMessage(err));
    }
  }

  if (editing && !locked) {
    if (plansQuery.isLoading || (latest && planQuery.isLoading)) {
      return (
        <View testID="meal-diary-form-loading" className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator color="#14bfa6" />
        </View>
      );
    }

    const consumed = new Date(log.consumedAt);
    return (
      <Screen contentContainerClassName="grow p-6">
        <View className="gap-6">
          <Text className="font-heading text-2xl text-foreground">Editar refeição</Text>
          <MealLogForm
            plans={plans}
            plan={planQuery.data ?? null}
            submitting={update.isPending}
            onSubmit={(body) => void onSubmit(body)}
            initialValues={{
              consumedAtDate: formatLocalDate(consumed),
              consumedAtTime: formatLocalTime(consumed),
              source: log.source,
              mealOptionId: log.mealOptionId ?? '',
              freeText: log.freeText ?? '',
              note: log.note ?? '',
            }}
          />
          {formError ? <Text className="font-sans text-sm text-destructive">{formError}</Text> : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen contentContainerClassName="grow p-6">
      <View className="gap-6">
        <View className="gap-1">
          <Text className="font-heading text-2xl text-foreground">{logTitle(log)}</Text>
          <Text className="font-sans text-base text-muted-foreground">
            {new Date(log.consumedAt).toLocaleDateString('pt-BR')}{' '}
            {new Date(log.consumedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {log.note ? <Text className="font-sans text-sm text-muted-foreground">{log.note}</Text> : null}
        </View>
        <Button label="Editar" onPress={locked ? alertLocked : () => setEditing(true)} />
        <Button label="Apagar" variant="outline" onPress={locked ? alertLocked : confirmDelete} />
        {formError ? <Text className="font-sans text-sm text-destructive">{formError}</Text> : null}
      </View>
    </Screen>
  );
}
