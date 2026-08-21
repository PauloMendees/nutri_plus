import type { MealLog } from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export type MealLogRange = '30' | '90' | 'all';

export function listPatientMealLogs(patientId: string, range: MealLogRange): Promise<MealLog[]> {
  const params = new URLSearchParams();
  if (range === 'all') params.set('all', 'true');
  else {
    const to = new Date();
    const from = new Date(to.getTime() - Number(range) * 24 * 60 * 60 * 1000);
    params.set('from', from.toISOString());
    params.set('to', to.toISOString());
  }
  return browserApiFetch<MealLog[]>(`/patients/${patientId}/meal-logs?${params.toString()}`);
}
