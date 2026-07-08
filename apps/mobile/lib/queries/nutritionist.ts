import { useQuery } from '@tanstack/react-query';
import type { NutritionistContact } from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

export function useMyNutritionist() {
  return useQuery({
    queryKey: ['me', 'nutritionist'],
    queryFn: () => apiFetch<NutritionistContact | null>('/me/nutritionist'),
  });
}
