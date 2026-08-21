import type { MealLog } from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export type MealLogRange = '30' | '90' | 'all';

export type MealLogFilter =
  | { kind: 'preset'; range: MealLogRange }
  | { kind: 'custom'; from: string; to: string };

export function listPatientMealLogs(patientId: string, filter: MealLogFilter): Promise<MealLog[]> {
  const params = new URLSearchParams();
  if (filter.kind === 'custom') {
    params.set('from', filter.from);
    params.set('to', filter.to);
  } else if (filter.range === 'all') {
    params.set('all', 'true');
  } else {
    const to = new Date();
    const from = new Date(to.getTime() - Number(filter.range) * 24 * 60 * 60 * 1000);
    params.set('from', from.toISOString());
    params.set('to', to.toISOString());
  }
  return browserApiFetch<MealLog[]>(`/patients/${patientId}/meal-logs?${params.toString()}`);
}
