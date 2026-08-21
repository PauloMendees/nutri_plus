import { useQuery } from '@tanstack/react-query';
import { listPatientMealLogs, type MealLogFilter } from '@/lib/api/meal-logs';

export function usePatientMealLogs(patientId: string, filter: MealLogFilter) {
  return useQuery({
    queryKey: ['meal-logs', patientId, filter],
    queryFn: () => listPatientMealLogs(patientId, filter),
    enabled: Boolean(patientId),
  });
}
