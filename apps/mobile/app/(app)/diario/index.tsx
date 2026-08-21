import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { MealLog } from '@nutri-plus/shared-types';
import { Screen } from '../../../components/ui/screen';
import { Button } from '../../../components/ui/button';
import { BrandHeader } from '../../../components/brand/brand-header';
import { useMyMealLogs } from '../../../lib/queries/meal-logs';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function groupByDay(logs: MealLog[]): { date: string; logs: MealLog[] }[] {
  const groups: { date: string; logs: MealLog[] }[] = [];
  for (const log of logs) {
    const date = formatDate(log.consumedAt);
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.logs.push(log);
    else groups.push({ date, logs: [log] });
  }
  return groups;
}

function logTitle(log: MealLog): string {
  return log.source === 'PLAN'
    ? `${log.mealName ?? 'Refeição'} · ${log.optionLabel ?? 'Opção'}`
    : (log.freeText ?? '');
}

export default function DiarioIndex() {
  const query = useMyMealLogs();

  if (query.isLoading) {
    return (
      <View testID="meal-diary-loading" className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#14bfa6" />
      </View>
    );
  }

  if (query.isError || !query.data) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="font-sans text-center text-base text-muted-foreground">
          Não foi possível carregar seu diário.
        </Text>
        <Button label="Tentar de novo" onPress={() => query.refetch()} />
      </View>
    );
  }

  const logs = query.data;
  const groups = groupByDay(logs);

  return (
    <View className="flex-1 bg-background">
      <Screen
        header={<BrandHeader />}
        contentContainerClassName="grow p-6"
        onRefresh={() => query.refetch()}
        refreshing={Boolean(query.isRefetching)}
      >
        <View className="gap-4">
          <Text className="font-heading text-2xl text-foreground">Diário</Text>
          {logs.length === 0 ? (
            <Text className="font-sans text-center text-base text-muted-foreground">
              Nenhuma refeição registrada ainda.
            </Text>
          ) : (
            groups.map((group) => (
              <View key={group.date} className="gap-2">
                <Text className="font-sans-medium text-sm text-foreground">{group.date}</Text>
                {group.logs.map((log) => (
                  <Pressable
                    key={log.id}
                    onPress={() => router.push(`/diario/${log.id}`)}
                    className="gap-1 rounded-xl border border-border bg-card p-4"
                  >
                    <View className="flex-row items-baseline justify-between gap-3">
                      <Text className="flex-1 font-sans-medium text-base text-foreground">{logTitle(log)}</Text>
                      <Text className="font-sans text-sm text-muted-foreground">{formatTime(log.consumedAt)}</Text>
                    </View>
                    {log.note ? (
                      <Text className="font-sans text-sm text-muted-foreground">{log.note}</Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ))
          )}
        </View>
      </Screen>
      <View testID="meal-diary-register-footer" className="border-t border-border bg-background px-6 py-4">
        <Button label="Registrar refeição" onPress={() => router.push('/diario/nova')} />
      </View>
    </View>
  );
}
