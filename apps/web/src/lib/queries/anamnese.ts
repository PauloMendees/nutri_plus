import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpsertAnamneseRequest } from '@nutri-plus/shared-types';
import { getAnamnese, upsertAnamnese } from '@/lib/api/anamnese';

export function useAnamnese(patientId: string) {
  return useQuery({ queryKey: ['anamnese', patientId], queryFn: () => getAnamnese(patientId) });
}

export function useUpsertAnamnese(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertAnamneseRequest) => upsertAnamnese(patientId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['anamnese', patientId] }),
  });
}
