import type { Food } from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function searchFoods(q: string, limit = 20): Promise<Food[]> {
  return browserApiFetch<Food[]>(`/foods?q=${encodeURIComponent(q)}&limit=${limit}`);
}
