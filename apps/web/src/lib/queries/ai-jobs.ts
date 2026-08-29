import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiJobView } from '@nutri-plus/shared-types';
import { consumeAiJob, getAiJob, listAiJobs, listAllAiJobs, retryAiJob } from '@/lib/api/ai-jobs';

const ACTIVE: AiJobView['status'][] = ['PENDING', 'RUNNING'];

// Invalidação usa o prefixo ['ai-jobs'] de propósito: existem duas chaves vivas,
// ['ai-jobs', patientId] (painel do paciente) e ['ai-jobs', 'all'] (widget
// global). Invalidar só a específica deixaria o widget desatualizado.

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

export function useAllAiJobs() {
  return useQuery({
    queryKey: ['ai-jobs', 'all'],
    queryFn: listAllAiJobs,
    // Mesma regra do hook por paciente: parado, não fica batendo na API.
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

export function useRetryAiJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => retryAiJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-jobs'] }),
  });
}

export function useConsumeAiJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => consumeAiJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-jobs'] }),
  });
}
