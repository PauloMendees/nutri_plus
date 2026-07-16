import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applySilhuetaScan, createSilhuetaScan, listSilhuetaScans } from '@/lib/api/silhueta';

export function useSilhuetaScans(patientId: string) {
  return useQuery({
    queryKey: ['silhueta', patientId],
    queryFn: () => listSilhuetaScans(patientId),
    enabled: Boolean(patientId),
  });
}

function useInvalidateSilhueta(patientId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['silhueta', patientId] });
}

export function useCreateSilhuetaScan(patientId: string) {
  const invalidate = useInvalidateSilhueta(patientId);
  return useMutation({
    mutationFn: (formData: FormData) => createSilhuetaScan(patientId, formData),
    onSuccess: invalidate,
  });
}

export function useApplySilhuetaScan(patientId: string) {
  const invalidateSilhueta = useInvalidateSilhueta(patientId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scanId: string) => applySilhuetaScan(patientId, scanId),
    onSuccess: () => {
      invalidateSilhueta();
      qc.invalidateQueries({ queryKey: ['assessments', patientId] });
    },
  });
}
