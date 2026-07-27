// storagePath NÃO é exposto no fio — a reprodução usa signedUrl (URL assinada curta).
export type TranscriptStatus = 'PROCESSING' | 'DONE' | 'FAILED';

export interface ConsultationAudio {
  id: string;
  patientId: string;
  mimeType: string;
  durationSec: number | null;
  consentConfirmed: boolean;
  recordedAt: string;
  signedUrl: string;
  transcript: string | null;
  transcriptStatus: TranscriptStatus | null; // null = nunca transcrito
  transcribedAt: string | null;
  transcriptError: string | null;
}

// Export LGPD: as consultas transcritas do próprio paciente (só o texto, sem o áudio).
export interface ConsultationTranscript {
  recordedAt: string;
  durationSec: number | null;
  transcript: string;
  transcribedAt: string | null;
}
