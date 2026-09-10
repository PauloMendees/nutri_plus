import { useMutation, useQueryClient } from '@tanstack/react-query';
import { commitPatientImport, previewPatientImport } from '@/lib/api/patient-import';

export function usePreviewPatientImport() {
  return useMutation({
    mutationFn: (file: File) => previewPatientImport(file),
  });
}

export function useCommitPatientImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, mapping }: { file: File; mapping: Record<string, string> }) =>
      commitPatientImport(file, mapping),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}
