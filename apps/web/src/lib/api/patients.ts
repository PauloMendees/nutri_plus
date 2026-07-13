import type {
  CreatePatientRequest,
  ListPatientsParams,
  Paginated,
  PatientDetail,
  PatientSummary,
  UpdatePatientRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch, browserApiUpload } from '@/lib/api/browser';

export function listPatients(
  params: ListPatientsParams = {},
): Promise<Paginated<PatientSummary>> {
  const qs = new URLSearchParams();
  const search = params.search?.trim();
  if (search) qs.set('search', search);
  if (params.page != null) qs.set('page', String(params.page));
  if (params.pageSize != null) qs.set('pageSize', String(params.pageSize));
  const query = qs.toString();
  return browserApiFetch<Paginated<PatientSummary>>(`/patients${query ? `?${query}` : ''}`);
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

export function uploadPatientPhoto(id: string, file: File): Promise<PatientDetail> {
  const formData = new FormData();
  formData.append('file', file);
  return browserApiUpload<PatientDetail>(`/patients/${id}/photo`, formData);
}

export function deletePatientPhoto(id: string): Promise<PatientDetail> {
  return browserApiFetch<PatientDetail>(`/patients/${id}/photo`, { method: 'DELETE' });
}
