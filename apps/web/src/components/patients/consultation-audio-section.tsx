'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAudios, useDeleteAudio, useTranscribeAudio } from '@/lib/queries/consultation-audio';
import { useRecording } from '@/components/recording/recording-provider';
import { DiscardRecordingDialog } from '@/components/recording/discard-recording-dialog';
import { fmtElapsed } from '@/components/recording/format';
import { ProGate } from '@/components/billing/pro-gate';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

export function ConsultationAudioSection({
  patientId,
  patientName,
  canEdit,
}: {
  patientId: string;
  patientName: string;
  canEdit: boolean;
}) {
  const query = useAudios(patientId);
  const remove = useDeleteAudio(patientId);
  const transcribe = useTranscribeAudio(patientId);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const rec = useRecording();
  const [consent, setConsent] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // Gravação global: pode ser deste paciente, de outro, ou nenhuma.
  const active = rec.state.status === 'idle' ? null : rec.state;
  const mine = active?.patientId === patientId ? active : null;
  const other = active && !mine ? active : null;

  async function startRecording() {
    const ok = await rec.start({ patientId, patientName });
    // Cada gravação exige marcar o consentimento de novo. Desmarca no início,
    // e não após o upload, porque a seção pode nem estar montada quando o
    // upload terminar.
    if (ok) setConsent(false);
  }

  function cancelRecording() {
    setConfirmingCancel(false);
    rec.discard();
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

  async function handleTranscribe(id: string) {
    try {
      await transcribe.mutateAsync(id);
    } catch {
      toast.error('Não foi possível iniciar a transcrição.');
    }
  }

  if (query.isLoading) return <Skeleton className="h-64 w-full max-w-4xl" />;
  const audios = query.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {canEdit && (
        <div className="rounded-xl border bg-card p-4">
          {other ? (
            <p className="text-sm text-muted-foreground">
              Há uma gravação em andamento de {other.patientName}.{' '}
              <Link
                href={`/patients/${other.patientId}?tab=anamnese`}
                className="font-semibold text-primary hover:underline"
              >
                Ir para a gravação
              </Link>
            </p>
          ) : mine?.status === 'recording' ? (
            <div className="flex flex-wrap items-center gap-3">
              <span role="timer" aria-live="off" aria-label="Tempo de gravação" className="font-mono text-lg tabular-nums">
                {fmtElapsed(rec.elapsedSec)}
              </span>

              <span aria-hidden className="flex h-8 items-end gap-[3px]" data-testid="audio-meter">
                {rec.levels.map((level, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-primary/70"
                    style={{ height: `${Math.max(8, level * 100)}%` }}
                  />
                ))}
              </span>

              <Button type="button" className="rounded-full" onClick={rec.stopAndSave}>Parar gravação</Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full text-destructive"
                onClick={() => setConfirmingCancel(true)}
              >
                Cancelar
              </Button>
            </div>
          ) : mine?.status === 'uploading' ? (
            <Button type="button" className="rounded-full" disabled>Enviando…</Button>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                O paciente consentiu com a gravação desta consulta.
              </label>
              <div className="mt-3">
                <Button type="button" className="rounded-full" onClick={startRecording} disabled={!consent}>
                  Gravar
                </Button>
              </div>
            </>
          )}

          <DiscardRecordingDialog
            open={confirmingCancel}
            onOpenChange={setConfirmingCancel}
            elapsedSec={rec.elapsedSec}
            onConfirm={cancelRecording}
          />
        </div>
      )}

      {audios.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma gravação ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {audios.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-center gap-3">
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
              </div>

              {a.transcriptStatus === 'PROCESSING' && (
                <p className="text-sm text-muted-foreground">
                  Transcrevendo…{' '}
                  {canEdit && (
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => handleTranscribe(a.id)}
                      disabled={transcribe.isPending}
                    >
                      Tentar de novo
                    </button>
                  )}
                </p>
              )}
              {a.transcriptStatus === 'DONE' && a.transcript && (
                <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">
                  {a.transcript}
                </div>
              )}
              {a.transcriptStatus === 'FAILED' && (
                <p className="text-sm text-destructive">
                  Falha na transcrição.{' '}
                  {canEdit && (
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => handleTranscribe(a.id)}
                      disabled={transcribe.isPending}
                    >
                      Tentar de novo
                    </button>
                  )}
                </p>
              )}
              {canEdit && a.transcriptStatus == null && (
                <ProGate feature="transcription" label="Transcrever (Pro)">
                  <Button type="button" variant="outline" size="sm" className="w-fit rounded-full"
                    onClick={() => handleTranscribe(a.id)} disabled={transcribe.isPending}>
                    Transcrever
                  </Button>
                </ProGate>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
