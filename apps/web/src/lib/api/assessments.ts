import type {
  BodyAssessment,
  CreateAssessmentRequest,
  UpdateAssessmentRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listAssessments(patientId: string): Promise<BodyAssessment[]> {
  return browserApiFetch<BodyAssessment[]>(`/patients/${patientId}/assessments`);
}

export function createAssessment(
  patientId: string,
  body: CreateAssessmentRequest,
): Promise<BodyAssessment> {
  return browserApiFetch<BodyAssessment>(`/patients/${patientId}/assessments`, {
    method: 'POST',
    body,
  });
}

export function updateAssessment(
  patientId: string,
  id: string,
  body: UpdateAssessmentRequest,
): Promise<BodyAssessment> {
  return browserApiFetch<BodyAssessment>(`/patients/${patientId}/assessments/${id}`, {
    method: 'PATCH',
    body,
  });
}

export function deleteAssessment(patientId: string, id: string): Promise<void> {
  return browserApiFetch<void>(`/patients/${patientId}/assessments/${id}`, {
    method: 'DELETE',
  });
}
