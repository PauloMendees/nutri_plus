import { useQuery } from '@tanstack/react-query';
import type { MyNutritionTarget } from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

export function getMyNutritionTarget(): Promise<MyNutritionTarget | null> {
  return apiFetch<MyNutritionTarget | null>('/me/nutrition-target');
}

export function useMyNutritionTarget() {
  return useQuery({ queryKey: ['me', 'nutrition-target'], queryFn: getMyNutritionTarget });
}
