'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAudios, useDeleteAudio, useUploadAudio } from '@/lib/queries/consultation-audio';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

export function ConsultationAudioSection({ patientId, canEdit }: { patientId: string; canEdit: boolean }) {
  const query = useAudios(patientId);
  const upload = useUploadAudio(patientId);
  const remove = useDeleteAudio(patientId);
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Release the microphone even if the user navigates away mid-recording:
  // the recorder's own onstop only fires on an explicit "Parar gravação".
  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stopStream();
    };
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const durationSec = Math.round((Date.now() - startedAtRef.current) / 1000);
        try {
          await upload.mutateAsync({ blob, durationSec, filename: 'consulta.webm' });
          toast.success('Gravação salva.');
          setConsent(false);
        } catch {
          toast.error('Não foi possível salvar a gravação.');
        }
      };
      startedAtRef.current = Date.now();
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.error('Não foi possível acessar o microfone.');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await remove.mutateAsync(id);
      toast.success('Gravação excluída.');
    } catch {
      toast.error('Não foi possível excluir a gravação.');
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  }

  if (query.isLoading) return <Skeleton className="h-64 w-full max-w-4xl" />;
  const audios = query.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {canEdit && (
        <div className="rounded-xl border bg-card p-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            O paciente consentiu com a gravação desta consulta.
          </label>
          <div className="mt-3">
            {recording ? (
              <Button type="button" className="rounded-full" onClick={stopRecording}>Parar gravação</Button>
            ) : (
              <Button type="button" className="rounded-full" onClick={startRecording} disabled={!consent || upload.isPending}>
                {upload.isPending ? 'Enviando…' : 'Gravar'}
              </Button>
            )}
          </div>
        </div>
      )}

      {audios.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma gravação ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {audios.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
              <span className="text-sm text-muted-foreground">{fmtDate(a.recordedAt)}</span>
              <audio controls src={a.signedUrl} className="min-w-0 flex-1" />
              {canEdit && (
                confirmingId === a.id ? (
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Excluir?</span>
                    <Button type="button" variant="outline" size="sm" className="rounded-full"
                      onClick={() => setConfirmingId(null)} disabled={deletingId === a.id}>Cancelar</Button>
                    <Button type="button" size="sm" className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => handleDelete(a.id)} disabled={deletingId === a.id} aria-label="Confirmar exclusão da gravação">
                      {deletingId === a.id ? 'Excluindo…' : 'Excluir'}
                    </Button>
                  </span>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="rounded-full text-destructive"
                    onClick={() => setConfirmingId(a.id)} aria-label="Excluir gravação">Excluir</Button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
