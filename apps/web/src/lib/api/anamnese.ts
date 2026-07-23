import type { PatientAnamnese, UpsertAnamneseRequest } from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function getAnamnese(patientId: string): Promise<PatientAnamnese | null> {
  return browserApiFetch<PatientAnamnese | null>(`/patients/${patientId}/anamnese`);
}

export function upsertAnamnese(patientId: string, body: UpsertAnamneseRequest): Promise<PatientAnamnese> {
  return browserApiFetch<PatientAnamnese>(`/patients/${patientId}/anamnese`, { method: 'PUT', body });
}
