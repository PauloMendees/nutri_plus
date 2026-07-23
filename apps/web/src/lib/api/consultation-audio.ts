import type { ConsultationAudio } from '@nutri-plus/shared-types';
import { browserApiFetch, browserApiUpload } from '@/lib/api/browser';

export function listAudios(patientId: string): Promise<ConsultationAudio[]> {
  return browserApiFetch<ConsultationAudio[]>(`/patients/${patientId}/audios`);
}

export function uploadAudio(
  patientId: string,
  args: { blob: Blob; durationSec: number; filename: string },
): Promise<ConsultationAudio> {
  const fd = new FormData();
  fd.append('file', args.blob, args.filename);
  fd.append('consentConfirmed', 'true');
  fd.append('durationSec', String(args.durationSec));
  return browserApiUpload<ConsultationAudio>(`/patients/${patientId}/audios`, fd);
}

export function deleteAudio(patientId: string, audioId: string): Promise<void> {
  return browserApiFetch<void>(`/patients/${patientId}/audios/${audioId}`, { method: 'DELETE' });
}
