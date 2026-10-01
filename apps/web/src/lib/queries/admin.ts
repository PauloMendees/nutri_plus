import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AdminNutritionistFilters } from '@nutri-plus/shared-types';
import { getAdminNutritionist, listAdminNutritionists, listAdminPatients } from '@/lib/api/admin';

export function useAdminNutritionists(f: AdminNutritionistFilters, page: number) {
  return useQuery({
    queryKey: ['admin', 'nutritionists', f, page],
    queryFn: () => listAdminNutritionists(f, page),
    placeholderData: keepPreviousData,
  });
}

export function useAdminNutritionist(id: string) {
  return useQuery({ queryKey: ['admin', 'nutritionist', id], queryFn: () => getAdminNutritionist(id), enabled: Boolean(id) });
}

export function useAdminPatients(search: string, page: number) {
  return useQuery({
    queryKey: ['admin', 'patients', search, page],
    queryFn: () => listAdminPatients(search, page),
    placeholderData: keepPreviousData,
  });
}
