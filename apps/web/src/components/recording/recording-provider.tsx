'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { uploadAudio } from '@/lib/api/consultation-audio';

export const BAR_COUNT = 24;

// 25 MB / (32 kbps) ≈ 1h45 de gravação — cobre a consulta mais longa na prática.
const AUDIO_BITS_PER_SECOND = 32_000;

export type RecordingTarget = { patientId: string; patientName: string };

export type RecordingState =
  | { status: 'idle' }
  | ({ status: 'recording'; startedAt: number } & RecordingTarget)
  | ({ status: 'uploading' } & RecordingTarget);

export interface RecordingApi {
  state: RecordingState;
  elapsedSec: number;
  levels: number[];
  start(target: RecordingTarget): Promise<boolean>;
  stopAndSave(): void;
  discard(): void;
}

const RecordingContext = createContext<RecordingApi | null>(null);

export function useRecording(): RecordingApi {
  const ctx = useContext(RecordingContext);
  if (!ctx) throw new Error('useRecording precisa estar dentro de <RecordingProvider>.');
  return ctx;
}

// Dono único do MediaRecorder. Vive no layout autenticado, e não na aba
// Anamnese, para a gravação sobreviver à troca de aba e de página: o
// TabsContent desmonta abas inativas.
export function RecordingProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<RecordingState>({ status: 'idle' });
  const [elapsedSec, setElapsedSec] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  // Consultado dentro do onstop: parar para descartar e parar para salvar são o
  // mesmo evento do MediaRecorder, então o motivo precisa viajar por fora.
  const cancelledRef = useRef(false);
  // Trava síncrona, ligada antes do await do getUserMedia: dois cliques
  // seguidos em "Gravar" não podem abrir duas gravações.
  const busyRef = useRef(false);
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

  async function finish(recorder: MediaRecorder, target: RecordingTarget) {
    stopStream();
    stopMeter();
    recorderRef.current = null;
    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (cancelledRef.current) {
      cancelledRef.current = false;
      busyRef.current = false;
      setState({ status: 'idle' });
      toast.info('Gravação descartada.');
      return;
    }
    setState({ status: 'uploading', ...target });
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    const durationSec = Math.round((Date.now() - startedAtRef.current) / 1000);
    try {
      await uploadAudio(target.patientId, { blob, durationSec, filename: 'consulta.webm' });
      toast.success('Gravação salva.');
      void qc.invalidateQueries({ queryKey: ['audios', target.patientId] });
    } catch {
      toast.error('Não foi possível salvar a gravação.');
    } finally {
      busyRef.current = false;
      setState({ status: 'idle' });
    }
  }

  async function start(target: RecordingTarget): Promise<boolean> {
    if (busyRef.current) {
      toast.error('Já existe uma gravação em andamento.');
      return false;
    }
    busyRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // 32 kbps opus: adequado para fala e para transcrição automática, e é o
      // que mantém uma consulta longa abaixo dos 25 MB que a API de transcrição
      // aceita. No padrão do navegador (~129 kbps) o teto cai para ~26 minutos.
      const recorder = new MediaRecorder(stream, { audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => { void finish(recorder, target); };
      cancelledRef.current = false;
      const startedAt = Date.now();
      startedAtRef.current = startedAt;
      setElapsedSec(0);
      recorder.start();
      recorderRef.current = recorder;
      setState({ status: 'recording', startedAt, ...target });
      startMeter(stream);
      return true;
    } catch {
      stopStream();
      busyRef.current = false;
      toast.error('Não foi possível acessar o microfone.');
      return false;
    }
  }

  function stopAndSave() {
    recorderRef.current?.stop();
  }

  function discard() {
    cancelledRef.current = true;
    recorderRef.current?.stop();
  }

  const recording = state.status === 'recording';

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

  // Recarregar ou fechar a aba mata o MediaRecorder; o navegador pede
  // confirmação antes.
  useEffect(() => {
    if (!recording) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [recording]);

  // O layout só desmonta ao sair do app (ex.: logout). Aí o parcial é salvo —
  // melhor que descartar a consulta inteira.
  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stopStream();
      stopMeter();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RecordingContext.Provider value={{ state, elapsedSec, levels, start, stopAndSave, discard }}>
      {children}
    </RecordingContext.Provider>
  );
}
