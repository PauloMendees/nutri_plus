import { useLocalSearchParams } from 'expo-router';
import { MealPlanView } from '../../../components/meal-plan/meal-plan-view';

export default function PlanoDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MealPlanView planId={id} />;
}
