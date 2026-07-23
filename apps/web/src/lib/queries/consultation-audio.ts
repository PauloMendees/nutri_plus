import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteAudio, listAudios, uploadAudio } from '@/lib/api/consultation-audio';

export function useAudios(patientId: string) {
  return useQuery({ queryKey: ['audios', patientId], queryFn: () => listAudios(patientId) });
}

export function useUploadAudio(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { blob: Blob; durationSec: number; filename: string }) => uploadAudio(patientId, args),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audios', patientId] }),
  });
}

export function useDeleteAudio(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (audioId: string) => deleteAudio(patientId, audioId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audios', patientId] }),
  });
}
