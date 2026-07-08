import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import type { MealPlanSummary } from '@nutri-plus/shared-types';
import { Screen } from '../../../components/ui/screen';
import { Button } from '../../../components/ui/button';
import { MealPlanView } from '../../../components/meal-plan/meal-plan-view';
import { BrandHeader } from '../../../components/brand/brand-header';
import { useMyMealPlans } from '../../../lib/queries/meal-plans';

function formatDate(iso: string | undefined): string {
  return iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
}

export default function PlanosIndex() {
  const query = useMyMealPlans();

  if (query.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#14bfa6" />
      </View>
    );
  }
  if (query.isError || !query.data) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="font-sans text-center text-base text-muted-foreground">
          Não foi possível carregar seus planos.
        </Text>
        <Button label="Tentar de novo" onPress={() => query.refetch()} />
      </View>
    );
  }

  const plans = query.data;

  if (plans.length === 0) {
    return (
      <Screen header={<BrandHeader />} contentContainerClassName="grow justify-center p-6">
        <Text className="font-sans text-center text-base text-muted-foreground">
          Nenhum plano disponível ainda.
        </Text>
      </Screen>
    );
  }

  if (plans.length === 1) {
    return <MealPlanView planId={plans[0].id} header={<BrandHeader />} />;
  }

  return (
    <Screen header={<BrandHeader />} contentContainerClassName="grow p-6">
      <View className="gap-3">
        <Text className="font-heading text-2xl text-foreground">Seus planos</Text>
        {plans.map((p: MealPlanSummary) => (
          <Link key={p.id} href={{ pathname: '/planos/[id]', params: { id: p.id } }} asChild>
            <Pressable className="gap-1 rounded-xl border border-border bg-card p-4">
              <Text className="font-sans-medium text-base text-foreground">{p.title ?? 'Plano alimentar'}</Text>
              <Text className="font-sans text-sm text-muted-foreground">
                {(p.objective ?? '—') + ' · ' + formatDate(p.createdAt)}
              </Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </Screen>
  );
}
