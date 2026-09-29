import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteAudio, listAudios, transcribeAudio } from '@/lib/api/consultation-audio';

export function useAudios(patientId: string) {
  return useQuery({
    queryKey: ['audios', patientId],
    queryFn: () => listAudios(patientId),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((a) => a.transcriptStatus === 'PROCESSING') ? 4000 : false,
  });
}

// useUploadAudio (mutation) foi removido: o upload da gravação de consulta
// passou a viver inteiro no RecordingProvider, que chama uploadAudio direto
// (ver recording-provider.tsx) — não sobrava chamador deste hook.

export function useDeleteAudio(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (audioId: string) => deleteAudio(patientId, audioId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audios', patientId] }),
  });
}

export function useTranscribeAudio(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (audioId: string) => transcribeAudio(patientId, audioId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audios', patientId] }),
  });
}
