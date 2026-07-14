import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BodyAssessment, CreateAssessmentRequest, MyEvolutionResponse } from '@nutri-plus/shared-types';
// SDK 54's expo-file-system v19 moved cacheDirectory/downloadAsync to a legacy
// subpath — the new top-level API's downloadAsync throws unconditionally at
// runtime (it's a deprecation shim), so the working API lives here.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiFetch } from '../api';
import { supabase } from '../supabase';

export function getMyEvolution(): Promise<MyEvolutionResponse> {
  return apiFetch<MyEvolutionResponse>('/me/assessments');
}

export function useMyEvolution() {
  return useQuery({ queryKey: ['me', 'assessments'], queryFn: getMyEvolution });
}

export function useCreateMyAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAssessmentRequest) =>
      apiFetch<BodyAssessment>('/me/assessments', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'assessments'] });
    },
  });
}

// Downloads the authenticated evolution PDF to a cache file, then opens the OS share sheet.
export async function downloadEvolutionPdf(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const base = process.env.EXPO_PUBLIC_API_URL;
  const url = `${base}/v1/me/assessments/pdf`;
  const target = `${FileSystem.cacheDirectory}evolucao.pdf`;
  const { uri } = await FileSystem.downloadAsync(url, target, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}
