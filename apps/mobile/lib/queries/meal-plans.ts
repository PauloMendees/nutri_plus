import { useQuery } from '@tanstack/react-query';
import type { MealPlan, MealPlanSummary } from '@nutri-plus/shared-types';
// SDK 54's expo-file-system v19 moved cacheDirectory/downloadAsync to a legacy
// subpath — the new top-level API's downloadAsync throws unconditionally at
// runtime (it's a deprecation shim), so the working API lives here.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiFetch } from '../api';
import { supabase } from '../supabase';

export function useMyMealPlans() {
  return useQuery({
    queryKey: ['me', 'meal-plans'],
    queryFn: () => apiFetch<MealPlanSummary[]>('/me/meal-plans'),
  });
}

export function useMyMealPlan(id: string) {
  return useQuery({
    queryKey: ['me', 'meal-plans', id],
    queryFn: () => apiFetch<MealPlan>(`/me/meal-plans/${id}`),
    enabled: Boolean(id),
  });
}

// Downloads the authenticated PDF to a cache file, then opens the OS share sheet.
export async function downloadMealPlanPdf(id: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const base = process.env.EXPO_PUBLIC_API_URL;
  const url = `${base}/v1/me/meal-plans/${id}/pdf`;
  const target = `${FileSystem.cacheDirectory}plano-alimentar.pdf`;
  const { uri } = await FileSystem.downloadAsync(url, target, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}
