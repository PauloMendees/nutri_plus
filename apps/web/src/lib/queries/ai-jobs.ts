import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiJobView } from '@nutri-plus/shared-types';
import { consumeAiJob, getAiJob, listAiJobs, retryAiJob } from '@/lib/api/ai-jobs';

const ACTIVE: AiJobView['status'][] = ['PENDING', 'RUNNING'];

export function useAiJobs(patientId: string) {
  return useQuery({
    queryKey: ['ai-jobs', patientId],
    queryFn: () => listAiJobs(patientId),
    enabled: Boolean(patientId),
    // Só faz polling enquanto houver trabalho em voo: parado, a página não fica
    // batendo na API de graça.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((j) => ACTIVE.includes(j.status)) ? 2000 : false,
  });
}

export function useAiJob(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['ai-job', id],
    queryFn: () => getAiJob(id),
    enabled: enabled && Boolean(id),
  });
}

export function useRetryAiJob(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => retryAiJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-jobs', patientId] }),
  });
}

export function useConsumeAiJob() {
  return useMutation({ mutationFn: (id: string) => consumeAiJob(id) });
}
