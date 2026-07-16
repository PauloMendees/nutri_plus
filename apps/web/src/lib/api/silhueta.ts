import type { BodyAssessment, SilhuetaScan } from '@nutri-plus/shared-types';
import { browserApiFetch, browserApiUpload } from '@/lib/api/browser';

export function listSilhuetaScans(patientId: string): Promise<SilhuetaScan[]> {
  return browserApiFetch<SilhuetaScan[]>(`/patients/${patientId}/silhueta`);
}

export function createSilhuetaScan(patientId: string, formData: FormData): Promise<SilhuetaScan> {
  return browserApiUpload<SilhuetaScan>(`/patients/${patientId}/silhueta`, formData);
}

export function applySilhuetaScan(patientId: string, scanId: string): Promise<BodyAssessment> {
  return browserApiFetch<BodyAssessment>(`/patients/${patientId}/silhueta/${scanId}/apply`, {
    method: 'POST',
  });
}
