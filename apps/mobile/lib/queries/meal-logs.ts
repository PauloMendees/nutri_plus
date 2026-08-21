import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateMealLogRequest, MealLog, UpdateMealLogRequest } from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

export function useMyMealLogs() {
  return useQuery({
    queryKey: ['me', 'meal-logs'],
    queryFn: () => apiFetch<MealLog[]>('/me/meal-logs'),
  });
}

export function useCreateMealLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMealLogRequest) =>
      apiFetch<MealLog>('/me/meal-logs', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'meal-logs'] }),
  });
}

export function useUpdateMealLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMealLogRequest }) =>
      apiFetch<MealLog>(`/me/meal-logs/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'meal-logs'] }),
  });
}

export function useDeleteMealLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/me/meal-logs/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'meal-logs'] }),
  });
}
