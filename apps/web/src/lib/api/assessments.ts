import type {
  BodyAssessment,
  CreateAssessmentRequest,
  UpdateAssessmentRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch, browserApiDownload } from '@/lib/api/browser';

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

export async function downloadAssessmentsPdf(patientId: string): Promise<void> {
  const blob = await browserApiDownload(`/patients/${patientId}/assessments/pdf`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'evolucao.pdf';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
