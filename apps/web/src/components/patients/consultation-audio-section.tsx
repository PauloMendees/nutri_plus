'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAudios, useDeleteAudio, useTranscribeAudio, useUploadAudio } from '@/lib/queries/consultation-audio';
import { ProGate } from '@/components/billing/pro-gate';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

// mm:ss, virando h:mm:ss depois de uma hora — consulta longa é comum.
export function fmtElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

const BAR_COUNT = 24;

export function ConsultationAudioSection({ patientId, canEdit }: { patientId: string; canEdit: boolean }) {
  const query = useAudios(patientId);
  const upload = useUploadAudio(patientId);
  const remove = useDeleteAudio(patientId);
  const transcribe = useTranscribeAudio(patientId);
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  // Consultado dentro do onstop: parar para cancelar e parar para salvar são o
  // mesmo evento do MediaRecorder, então o motivo precisa viajar por fora.
  const cancelledRef = useRef(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0));
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function stopMeter() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevels(Array(BAR_COUNT).fill(0));
  }

  // Medidor de volume: sem ele não há como saber se o microfone certo foi
  // capturado antes de perder a consulta inteira. Puramente visual — não toca
  // no MediaRecorder, que grava o mesmo stream.
  function startMeter(stream: MediaStream) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        // RMS em torno de 128 (silêncio), normalizado para 0..1.
        let acc = 0;
        for (const v of buf) acc += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(acc / buf.length);
        setLevels((prev) => [...prev.slice(1), Math.min(1, rms * 3)]);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // Sem medidor: a gravação continua normalmente.
    }
  }

  // Cronômetro derivado de startedAtRef, nunca de um acumulador: aba em segundo
  // plano estrangula timers, e um contador atrasaria — justamente o número que
  // vira durationSec, base do custo e da cota de transcrição.
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [recording]);

  // Libera o microfone mesmo se o usuário sair da tela no meio da gravação.
  // `recorder.stop()` dispara o onstop, que sobe o áudio parcial — preferimos
  // salvar o parcial a descartar a consulta inteira.
  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stopStream();
      stopMeter();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        stopMeter();
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (cancelledRef.current) {
          cancelledRef.current = false;
          toast.info('Gravação descartada.');
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const durationSec = Math.round((Date.now() - startedAtRef.current) / 1000);
        try {
          await upload.mutateAsync({ blob, durationSec, filename: 'consulta.webm' });
          toast.success('Gravação salva.');
          setConsent(false);
        } catch {
          toast.error('Não foi possível salvar a gravação.');
        }
      };
      cancelledRef.current = false;
      startedAtRef.current = Date.now();
      setElapsedSec(0);
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      startMeter(stream);
    } catch {
      toast.error('Não foi possível acessar o microfone.');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  function cancelRecording() {
    cancelledRef.current = true;
    setConfirmingCancel(false);
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
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            O paciente consentiu com a gravação desta consulta.
          </label>
          <div className="mt-3">
            {recording ? (
              <div className="flex flex-wrap items-center gap-3">
                <span
                  role="timer"
                  aria-live="off"
                  aria-label="Tempo de gravação"
                  className="font-mono text-lg tabular-nums"
                >
                  {fmtElapsed(elapsedSec)}
                </span>

                <span aria-hidden className="flex h-8 items-end gap-[3px]" data-testid="audio-meter">
                  {levels.map((level, i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full bg-primary/70"
                      style={{ height: `${Math.max(8, level * 100)}%` }}
                    />
                  ))}
                </span>

                <Button type="button" className="rounded-full" onClick={stopRecording}>Parar gravação</Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full text-destructive"
                  onClick={() => setConfirmingCancel(true)}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button type="button" className="rounded-full" onClick={startRecording} disabled={!consent || upload.isPending}>
                {upload.isPending ? 'Enviando…' : 'Gravar'}
              </Button>
            )}
          </div>

          {/* Modal, e não o confirm inline usado na exclusão: descartar uma
              consulta inteira por clique errado é caro demais. A gravação
              continua correndo enquanto o diálogo está aberto. */}
          <Dialog open={confirmingCancel} onOpenChange={setConfirmingCancel}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Descartar esta gravação?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                O áudio gravado até agora ({fmtElapsed(elapsedSec)}) será perdido e nada
                será salvo. A gravação continua enquanto você decide.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setConfirmingCancel(false)}>
                  Continuar gravando
                </Button>
                <Button
                  type="button"
                  className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={cancelRecording}
                >
                  Descartar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
