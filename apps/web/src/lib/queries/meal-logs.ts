import { useQuery } from '@tanstack/react-query';
import { listPatientMealLogs, type MealLogRange } from '@/lib/api/meal-logs';

export function usePatientMealLogs(patientId: string, range: MealLogRange) {
  return useQuery({
    queryKey: ['meal-logs', patientId, range],
    queryFn: () => listPatientMealLogs(patientId, range),
    enabled: Boolean(patientId),
  });
}
