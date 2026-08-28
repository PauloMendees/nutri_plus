import type { AiJobDetail, AiJobView, CreateAiJobResponse } from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listAiJobs(patientId: string): Promise<AiJobView[]> {
  return browserApiFetch<AiJobView[]>(`/ai/jobs?patientId=${patientId}`);
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
