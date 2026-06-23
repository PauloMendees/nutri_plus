import type {
  CreatePatientRequest,
  PatientDetail,
  PatientSummary,
  UpdatePatientRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listPatients(): Promise<PatientSummary[]> {
  return browserApiFetch<PatientSummary[]>('/patients');
}

export function getPatient(id: string): Promise<PatientDetail> {
  return browserApiFetch<PatientDetail>(`/patients/${id}`);
}

export function createPatient(body: CreatePatientRequest): Promise<PatientDetail> {
  return browserApiFetch<PatientDetail>('/patients', { method: 'POST', body });
}

export function updatePatient(id: string, body: UpdatePatientRequest): Promise<PatientDetail> {
  return browserApiFetch<PatientDetail>(`/patients/${id}`, { method: 'PATCH', body });
}
