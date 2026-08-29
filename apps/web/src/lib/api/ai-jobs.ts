import type { AiJobDetail, AiJobView, CreateAiJobResponse } from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listAiJobs(patientId: string): Promise<AiJobView[]> {
  return browserApiFetch<AiJobView[]>(`/ai/jobs?patientId=${patientId}`);
}

// Sem paciente: todos os trabalhos do nutricionista. É o que o widget global
// consome, já que ele aparece em telas que não têm paciente no contexto.
export function listAllAiJobs(): Promise<AiJobView[]> {
  return browserApiFetch<AiJobView[]>('/ai/jobs');
}

export function getAiJob(id: string): Promise<AiJobDetail> {
  return browserApiFetch<AiJobDetail>(`/ai/jobs/${id}`);
}

export function retryAiJob(id: string): Promise<CreateAiJobResponse> {
  return browserApiFetch<CreateAiJobResponse>(`/ai/jobs/${id}/retry`, { method: 'POST' });
}

export function consumeAiJob(id: string): Promise<void> {
  return browserApiFetch<void>(`/ai/jobs/${id}/consume`, { method: 'POST' });
}
