// storagePath NÃO é exposto no fio — a reprodução usa signedUrl (URL assinada curta).
export interface ConsultationAudio {
  id: string;
  patientId: string;
  mimeType: string;
  durationSec: number | null;
  consentConfirmed: boolean;
  recordedAt: string;
  signedUrl: string;
}
