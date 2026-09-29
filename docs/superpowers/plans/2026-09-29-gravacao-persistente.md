# Gravação de consulta persistente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A gravação de consulta sobrevive à navegação dentro do app, com um floater no centro inferior para parar/salvar ou descartar fora da aba Anamnese do paciente gravado.

**Architecture:** Um `RecordingProvider` montado no layout `(app)` passa a ser o único dono do `MediaRecorder`; `ConsultationAudioSection` e o novo `RecordingFloater` consomem `useRecording()`. O upload chama `uploadAudio` direto com o `patientId` capturado no início e invalida `['audios', patientId]`.

**Tech Stack:** Next.js App Router (client components), React 19, TanStack Query, Radix Dialog, sonner, Vitest + Testing Library (jsdom). Tudo em `apps/web`.

**Spec:** `docs/superpowers/specs/2026-09-29-gravacao-persistente-design.md`

## Global Constraints

- Uma gravação por vez: `start()` é a única porta de entrada e recusa se já houver gravação (ou início pendente).
- Gravar em `audioBitsPerSecond: 32_000`; nome do arquivo `consulta.webm`; mime `recorder.mimeType || 'audio/webm'`.
- Cronômetro derivado de `startedAt` (`Date.now() - startedAt`), nunca de acumulador.
- Medidor respeita `prefers-reduced-motion: reduce` (não inicia).
- Toasts (texto exato): `'Gravação salva.'`, `'Não foi possível salvar a gravação.'`, `'Gravação descartada.'`, `'Não foi possível acessar o microfone.'`, `'Já existe uma gravação em andamento.'`.
- Floater só inicia nada: apenas **Parar e salvar** e **Descartar** (opção B fora do escopo).
- Floater oculto quando `pathname === '/patients/{id}'` **e** `searchParams.get('tab') === 'anamnese'` para o paciente gravado.
- Floater: `fixed bottom-4`, centralizado no desktop, largura com 16px de margem no mobile; não sobrepõe `CornerWidgets` (canto inferior direito).
- `beforeunload` registrado apenas enquanto `status === 'recording'`.
- Copy em pt-BR; comentários no estilo do código vizinho (pt-BR, explicam o porquê).

**Desvio consciente do spec:** `start()` retorna `Promise<boolean>` (e não `Promise<void>`) para a seção saber se deve desmarcar o consentimento.

## Review Focus

1. Duplo clique em **Gravar** antes do prompt do microfone resolver → só uma gravação e um `getUserMedia` (teste na Task 1).
2. Permissão de microfone negada → estado volta a `idle`, toast de erro, dá para tentar de novo (Task 1).
3. Upload falha depois de parar pelo floater → toast de erro, estado `idle`, nova gravação possível (Task 1).
4. `/patients/{id}` sem `?tab=` (abre na aba Dados) → floater **visível** (Task 3).
5. Provider desmonta com gravação ativa (ex.: logout) → envia o parcial e libera o microfone (Task 1).

---

## File Structure

- Create `apps/web/src/components/recording/format.ts` — `fmtElapsed` (movido da seção).
- Create `apps/web/src/components/recording/format.test.ts`
- Create `apps/web/src/components/recording/test-media.ts` — dublês de `MediaRecorder`/`getUserMedia` compartilhados pelos testes.
- Create `apps/web/src/components/recording/recording-provider.tsx` — contexto, estado, recorder, medidor, cronômetro, upload, `beforeunload`.
- Create `apps/web/src/components/recording/recording-provider.test.tsx`
- Create `apps/web/src/components/recording/discard-recording-dialog.tsx` — diálogo de descarte compartilhado.
- Create `apps/web/src/components/recording/recording-floater.tsx`
- Create `apps/web/src/components/recording/recording-floater.test.tsx`
- Modify `apps/web/src/components/patients/consultation-audio-section.tsx` — consome o contexto.
- Modify `apps/web/src/components/patients/consultation-audio-section.test.tsx`
- Modify `apps/web/src/components/patients/patient-detail.tsx:308-315` — passa `patientName`, atualiza comentário.
- Modify `apps/web/src/app/(app)/layout.tsx` — monta provider e floater.

Todos os comandos rodam em `apps/web`.

---

### Task 1: `RecordingProvider` + `useRecording`

**Files:**
- Create: `src/components/recording/format.ts`, `src/components/recording/format.test.ts`
- Create: `src/components/recording/test-media.ts`
- Create: `src/components/recording/recording-provider.tsx`
- Test: `src/components/recording/recording-provider.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // format.ts
  export function fmtElapsed(totalSec: number): string;
  // recording-provider.tsx
  export const BAR_COUNT = 24;
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
  export function RecordingProvider(props: { children: React.ReactNode }): JSX.Element;
  export function useRecording(): RecordingApi;
  // test-media.ts
  export const recorderOptions: unknown[];
  export const trackStop: Mock;
  export const getUserMedia: Mock;
  export function installMediaMocks(): void;
  ```

- [ ] **Step 1: Mover `fmtElapsed` para `format.ts` com seus testes**

`src/components/recording/format.ts`:

```ts
// mm:ss, virando h:mm:ss depois de uma hora — consulta longa é comum.
export function fmtElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}
```

`src/components/recording/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fmtElapsed } from './format';

describe('fmtElapsed', () => {
  it('usa mm:ss antes de uma hora', () => {
    expect(fmtElapsed(0)).toBe('00:00');
    expect(fmtElapsed(9)).toBe('00:09');
    expect(fmtElapsed(75)).toBe('01:15');
    expect(fmtElapsed(3599)).toBe('59:59');
  });

  it('passa a h:mm:ss a partir de uma hora', () => {
    expect(fmtElapsed(3600)).toBe('1:00:00');
    expect(fmtElapsed(3725)).toBe('1:02:05');
  });

  it('não quebra com entrada inválida', () => {
    expect(fmtElapsed(-5)).toBe('00:00');
    expect(fmtElapsed(12.7)).toBe('00:12');
  });
});
```

(A seção continua exportando o seu próprio `fmtElapsed` até a Task 2; não mexa nela agora.)

Run: `npx vitest run src/components/recording/format.test.ts` — Expected: PASS (3).

- [ ] **Step 2: Criar os dublês de mídia**

`src/components/recording/test-media.ts`:

```ts
import { vi } from 'vitest';

// jsdom não traz MediaRecorder nem getUserMedia; o dublê expõe só o que o
// gravador usa (start/stop/onstop/ondataavailable).
export const recorderOptions: unknown[] = [];
export const trackStop = vi.fn();
export const getUserMedia = vi.fn();

class FakeRecorder {
  constructor(_stream: unknown, options?: unknown) {
    recorderOptions.push(options);
  }
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.onstop?.(); }
}

export function installMediaMocks() {
  trackStop.mockReset();
  recorderOptions.length = 0;
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
}
```

- [ ] **Step 3: Escrever os testes do provider (falhando)**

`src/components/recording/recording-provider.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getUserMedia, installMediaMocks, recorderOptions, trackStop } from './test-media';

const uploadAudio = vi.fn();
vi.mock('@/lib/api/consultation-audio', () => ({
  uploadAudio: (...a: unknown[]) => uploadAudio(...a),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { RecordingProvider, useRecording } from './recording-provider';

const target = { patientId: 'p1', patientName: 'Maria' };
let qc: QueryClient;

function setup() {
  qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <RecordingProvider>{children}</RecordingProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useRecording(), { wrapper });
}

beforeEach(() => {
  installMediaMocks();
  uploadAudio.mockReset().mockResolvedValue({ id: 'a1' });
  Object.values(toast).forEach((f) => f.mockReset());
});

describe('RecordingProvider', () => {
  it('starts idle', () => {
    const { result } = setup();
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('records for the given patient at 32 kbps', async () => {
    const { result } = setup();
    let ok = false;
    await act(async () => { ok = await result.current.start(target); });
    expect(ok).toBe(true);
    expect(result.current.state).toMatchObject({ status: 'recording', patientId: 'p1', patientName: 'Maria' });
    // No padrão do navegador (~129 kbps) uma consulta de 30 min passa de 25 MB
    // e a API de transcrição recusa o arquivo inteiro.
    expect(recorderOptions[0]).toEqual({ audioBitsPerSecond: 32_000 });
  });

  it('refuses a second recording while one is running', async () => {
    const { result } = setup();
    await act(async () => { await result.current.start(target); });
    let ok = true;
    await act(async () => { ok = await result.current.start({ patientId: 'p2', patientName: 'João' }); });
    expect(ok).toBe(false);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Já existe uma gravação em andamento.');
    expect(result.current.state).toMatchObject({ patientId: 'p1' });
  });

  it('refuses a second start fired before the microphone prompt resolves', async () => {
    const { result } = setup();
    let results: boolean[] = [];
    await act(async () => {
      results = await Promise.all([result.current.start(target), result.current.start(target)]);
    });
    expect(results.sort()).toEqual([false, true]);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('uploads with the recorded patient id, invalidates its audios and returns to idle', async () => {
    const { result } = setup();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    await act(async () => { await result.current.start(target); });
    act(() => result.current.stopAndSave());

    await waitFor(() => expect(result.current.state).toEqual({ status: 'idle' }));
    expect(uploadAudio).toHaveBeenCalledWith('p1', expect.objectContaining({ filename: 'consulta.webm' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audios', 'p1'] });
    expect(toast.success).toHaveBeenCalledWith('Gravação salva.');
    expect(trackStop).toHaveBeenCalled();
  });

  it('discards without uploading', async () => {
    const { result } = setup();
    await act(async () => { await result.current.start(target); });
    act(() => result.current.discard());

    await waitFor(() => expect(result.current.state).toEqual({ status: 'idle' }));
    expect(uploadAudio).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('Gravação descartada.');
    expect(trackStop).toHaveBeenCalled();
  });

  it('returns to idle and allows a new recording when the upload fails', async () => {
    uploadAudio.mockRejectedValueOnce(new Error('boom'));
    const { result } = setup();
    await act(async () => { await result.current.start(target); });
    act(() => result.current.stopAndSave());

    await waitFor(() => expect(result.current.state).toEqual({ status: 'idle' }));
    expect(toast.error).toHaveBeenCalledWith('Não foi possível salvar a gravação.');

    let ok = false;
    await act(async () => { ok = await result.current.start(target); });
    expect(ok).toBe(true);
  });

  it('stays idle and allows a retry when the microphone is denied', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('NotAllowedError'));
    const { result } = setup();
    let ok = true;
    await act(async () => { ok = await result.current.start(target); });
    expect(ok).toBe(false);
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(toast.error).toHaveBeenCalledWith('Não foi possível acessar o microfone.');

    await act(async () => { ok = await result.current.start(target); });
    expect(ok).toBe(true);
  });

  it('warns before leaving the page only while recording', async () => {
    const { result } = setup();
    const idleEvt = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(idleEvt);
    expect(idleEvt.defaultPrevented).toBe(false);

    await act(async () => { await result.current.start(target); });
    const recEvt = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(recEvt);
    expect(recEvt.defaultPrevented).toBe(true);

    act(() => result.current.discard());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'idle' }));
    const afterEvt = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterEvt);
    expect(afterEvt.defaultPrevented).toBe(false);
  });

  it('saves the partial recording and releases the mic when the provider unmounts', async () => {
    const { result, unmount } = setup();
    await act(async () => { await result.current.start(target); });
    unmount();

    await waitFor(() => expect(uploadAudio).toHaveBeenCalledWith('p1', expect.anything()));
    expect(trackStop).toHaveBeenCalled();
  });

  it('throws a clear error when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useRecording())).toThrow(/RecordingProvider/);
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run src/components/recording/recording-provider.test.tsx`
Expected: FAIL — `Failed to resolve import "./recording-provider"`.

- [ ] **Step 5: Implementar o provider**

`src/components/recording/recording-provider.tsx`:

```tsx
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
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/components/recording`
Expected: PASS (format 3 + provider 11).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/recording
git commit -m "feat(web): RecordingProvider como dono único da gravação de consulta"
```

---

### Task 2: Seção de áudio consome o provider

**Files:**
- Create: `src/components/recording/discard-recording-dialog.tsx`
- Modify: `src/components/patients/consultation-audio-section.tsx`
- Modify: `src/components/patients/consultation-audio-section.test.tsx`
- Modify: `src/components/patients/patient-detail.tsx:308-315`

**Interfaces:**
- Consumes: `useRecording`, `RecordingProvider`, `BAR_COUNT` (não usado diretamente), `fmtElapsed` de `@/components/recording/format`, `installMediaMocks`/`trackStop` de `@/components/recording/test-media`.
- Produces:
  ```ts
  export function DiscardRecordingDialog(props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    elapsedSec: number;
    onConfirm: () => void;
  }): JSX.Element;
  export function ConsultationAudioSection(props: {
    patientId: string;
    patientName: string;
    canEdit: boolean;
  }): JSX.Element;
  ```
  `fmtElapsed` deixa de ser exportado pela seção.

- [ ] **Step 1: Reescrever os testes da seção (falhando)**

Substituir o topo de `consultation-audio-section.test.tsx` (imports, mocks, dublês, `startRecording`, `beforeEach`) por:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState, type ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ConsultationAudio } from '@nutri-plus/shared-types';
import { installMediaMocks, trackStop } from '@/components/recording/test-media';

const useAudiosMock = vi.fn();
const mutate = vi.fn();
const mutateAsync = vi.fn();
const transcribeMock = vi.fn();
const uploadAudio = vi.fn();

vi.mock('@/lib/queries/consultation-audio', () => ({
  useAudios: (...args: unknown[]) => useAudiosMock(...args),
  useDeleteAudio: () => ({ mutate, mutateAsync, isPending: false }),
  useTranscribeAudio: () => ({ mutate: transcribeMock, mutateAsync: transcribeMock, isPending: false }),
}));
vi.mock('@/lib/api/consultation-audio', () => ({
  uploadAudio: (...a: unknown[]) => uploadAudio(...a),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/queries/subscription', () => ({
  useSubscription: () => ({ data: { entitlements: { features: { transcription: true } } } }),
}));

import { RecordingProvider } from '@/components/recording/recording-provider';
import { ConsultationAudioSection } from './consultation-audio-section';

function renderWithRecording(ui: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RecordingProvider>{ui}</RecordingProvider>
    </QueryClientProvider>,
  );
}

function Section(props: { patientId?: string; patientName?: string; canEdit?: boolean }) {
  return (
    <ConsultationAudioSection
      patientId={props.patientId ?? 'p1'}
      patientName={props.patientName ?? 'Maria'}
      canEdit={props.canEdit ?? true}
    />
  );
}
```

Manter a função `audio()` como está. Depois dela:

```tsx
async function startRecording(
  scope: Pick<typeof screen, 'getByRole' | 'findByRole'> = screen,
) {
  await userEvent.click(scope.getByRole('checkbox'));
  await userEvent.click(scope.getByRole('button', { name: /^gravar$/i }));
  return scope.findByRole('button', { name: /parar gravação/i });
}

beforeEach(() => {
  installMediaMocks();
  useAudiosMock.mockReset().mockReturnValue({ data: [audio()], isLoading: false });
  mutate.mockReset();
  mutateAsync.mockReset().mockResolvedValue(audio());
  transcribeMock.mockReset().mockResolvedValue(undefined);
  uploadAudio.mockReset().mockResolvedValue(audio());
});
```

Nos testes existentes do `describe('ConsultationAudioSection')`:
- trocar todo `render(<ConsultationAudioSection patientId="p1" canEdit />)` por `renderWithRecording(<Section />)`;
- trocar `render(<ConsultationAudioSection patientId="p1" canEdit={false} />)` por `renderWithRecording(<Section canEdit={false} />)`;
- no teste do `<audio>`, usar `const { container } = renderWithRecording(<Section />);`;
- em **"descarta a gravação sem enviar…"** trocar as duas asserções `expect(mutateAsync).not.toHaveBeenCalled()` por `expect(uploadAudio).not.toHaveBeenCalled()`;
- em **"Continuar gravando…"** trocar `expect(mutateAsync).not.toHaveBeenCalled()` por `expect(uploadAudio).not.toHaveBeenCalled()`;
- substituir o corpo de **"parar normalmente envia o áudio"** por:

```tsx
  it('parar normalmente envia o áudio do paciente', async () => {
    renderWithRecording(<Section />);
    const stop = await startRecording();

    await userEvent.click(stop);

    await waitFor(() => expect(uploadAudio).toHaveBeenCalledTimes(1));
    expect(uploadAudio).toHaveBeenCalledWith('p1', expect.objectContaining({ filename: 'consulta.webm' }));
  });
```

Apagar todo o bloco `describe('fmtElapsed', …)` (os testes de formato estão em `format.test.ts`, e o de 32 kbps no provider).

Acrescentar ao fim do `describe('ConsultationAudioSection')`:

```tsx
  it('keeps recording when the section unmounts (tab or page change)', async () => {
    function Harness() {
      const [show, setShow] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setShow(false)}>sair da aba</button>
          {show && <Section />}
        </>
      );
    }
    renderWithRecording(<Harness />);
    await startRecording();

    await userEvent.click(screen.getByRole('button', { name: 'sair da aba' }));

    expect(trackStop).not.toHaveBeenCalled();
    expect(uploadAudio).not.toHaveBeenCalled();
  });

  it('hides the consent checkbox while recording and requires it again afterwards', async () => {
    renderWithRecording(<Section />);
    const stop = await startRecording();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    await userEvent.click(stop);

    const checkbox = await screen.findByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole('button', { name: /^gravar$/i })).toBeDisabled();
  });

  it('blocks recording another patient while one recording is running', async () => {
    renderWithRecording(
      <>
        <div data-testid="maria"><Section patientId="p1" patientName="Maria" /></div>
        <div data-testid="joao"><Section patientId="p2" patientName="João" /></div>
      </>,
    );
    await startRecording(within(screen.getByTestId('maria')));

    const joao = within(screen.getByTestId('joao'));
    expect(joao.getByText(/há uma gravação em andamento de maria/i)).toBeInTheDocument();
    expect(joao.getByRole('link', { name: /ir para a gravação/i })).toHaveAttribute(
      'href',
      '/patients/p1?tab=anamnese',
    );
    expect(joao.queryByRole('button', { name: /^gravar$/i })).not.toBeInTheDocument();
  });
```


- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/patients/consultation-audio-section.test.tsx`
Expected: FAIL — os testes novos (a seção ainda grava sozinha: desmontar para a gravação; nada de aviso de outro paciente) e os de upload (`uploadAudio` não é chamado).

- [ ] **Step 3: Extrair o diálogo de descarte**

`src/components/recording/discard-recording-dialog.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fmtElapsed } from './format';

// Modal, e não o confirm inline usado na exclusão: descartar uma consulta
// inteira por clique errado é caro demais. A gravação continua correndo
// enquanto o diálogo está aberto.
export function DiscardRecordingDialog({
  open,
  onOpenChange,
  elapsedSec,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  elapsedSec: number;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Descartar esta gravação?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          O áudio gravado até agora ({fmtElapsed(elapsedSec)}) será perdido e nada
          será salvo. A gravação continua enquanto você decide.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Continuar gravando
          </Button>
          <Button
            type="button"
            className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Descartar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Migrar a seção**

Em `consultation-audio-section.tsx`:

1. Imports: remover `useEffect`, `useRef`, `useUploadAudio`, e `Dialog*`; acrescentar:
   ```tsx
   import Link from 'next/link';
   import { useRecording } from '@/components/recording/recording-provider';
   import { DiscardRecordingDialog } from '@/components/recording/discard-recording-dialog';
   import { fmtElapsed } from '@/components/recording/format';
   ```
2. Apagar `fmtElapsed`, `BAR_COUNT` e `AUDIO_BITS_PER_SECOND` do arquivo.
3. Assinatura: `export function ConsultationAudioSection({ patientId, patientName, canEdit }: { patientId: string; patientName: string; canEdit: boolean })`.
4. Apagar os estados/refs de gravação (`recording`, `recorderRef`, `streamRef`, `chunksRef`, `startedAtRef`, `cancelledRef`, `elapsedSec`, `levels`, `audioCtxRef`, `rafRef`), as funções `stopStream`, `stopMeter`, `startMeter`, `startRecording`, `stopRecording`, `cancelRecording`, e os dois `useEffect` (cronômetro e cleanup de desmontagem — este é o bug).
5. No lugar, logo após os hooks de query:
   ```tsx
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
   ```
   (Manter `confirmingId`/`deletingId` e `handleDelete`/`handleTranscribe` como estão; remover a declaração antiga de `consent` e `confirmingCancel`.)
6. Substituir o bloco `{canEdit && ( <div className="rounded-xl border bg-card p-4"> … </div> )}` por:

```tsx
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
```

- [ ] **Step 5: Passar o nome do paciente**

Em `patient-detail.tsx`, no `TabsContent value="anamnese"`:

```tsx
          {/* A gravação em si vive no RecordingProvider do layout: sair da aba
              não a interrompe. Aqui ficam o consentimento, o início e o histórico. */}
          <div className="space-y-6">
            <ConsultationAudioSection patientId={patient.id} patientName={patient.name} canEdit={canEdit} />
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/components/patients src/components/recording`
Expected: PASS. Se `patient-detail.test.tsx` renderizar a aba Anamnese e quebrar com "useRecording precisa estar dentro de <RecordingProvider>", mockar no topo daquele teste:

```tsx
vi.mock('@/components/patients/consultation-audio-section', () => ({
  ConsultationAudioSection: () => <div data-testid="audio-section" />,
}));
```

(só se já não houver um mock equivalente — conferir antes).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/recording/discard-recording-dialog.tsx apps/web/src/components/patients
git commit -m "feat(web): gravação da anamnese sobrevive à troca de aba"
```

---

### Task 3: `RecordingFloater` + montagem no layout

**Files:**
- Create: `src/components/recording/recording-floater.tsx`
- Test: `src/components/recording/recording-floater.test.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `useRecording`, `RecordingApi`, `RecordingProvider` (Task 1); `DiscardRecordingDialog` (Task 2); `fmtElapsed`.
- Produces: `export function RecordingFloater(): JSX.Element | null`.

- [ ] **Step 1: Escrever os testes (falhando)**

`src/components/recording/recording-floater.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RecordingApi } from './recording-provider';

let pathname = '/agenda';
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => search,
}));

const stopAndSave = vi.fn();
const discard = vi.fn();
let api: RecordingApi;
vi.mock('./recording-provider', () => ({
  BAR_COUNT: 24,
  useRecording: () => api,
}));

import { RecordingFloater } from './recording-floater';

function recordingApi(over: Partial<RecordingApi> = {}): RecordingApi {
  return {
    state: { status: 'recording', patientId: 'p1', patientName: 'Maria', startedAt: 0 },
    elapsedSec: 75,
    levels: Array(24).fill(0),
    start: vi.fn(),
    stopAndSave,
    discard,
    ...over,
  };
}

beforeEach(() => {
  pathname = '/agenda';
  search = new URLSearchParams();
  stopAndSave.mockReset();
  discard.mockReset();
  api = recordingApi();
});

describe('RecordingFloater', () => {
  it('renders nothing when idle', () => {
    api = recordingApi({ state: { status: 'idle' } });
    const { container } = render(<RecordingFloater />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the patient, the timer and a link back to the anamnese on other pages', () => {
    render(<RecordingFloater />);
    const region = screen.getByRole('region', { name: /gravação em andamento/i });
    expect(region).toHaveTextContent(/gravando · maria/i);
    expect(screen.getByRole('timer', { name: /tempo de gravação/i })).toHaveTextContent('01:15');
    expect(screen.getByRole('link', { name: /abrir anamnese/i })).toHaveAttribute(
      'href',
      '/patients/p1?tab=anamnese',
    );
  });

  it('hides on the anamnese tab of the recorded patient', () => {
    pathname = '/patients/p1';
    search = new URLSearchParams('tab=anamnese');
    const { container } = render(<RecordingFloater />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows on another tab of the recorded patient, including the default tab', () => {
    pathname = '/patients/p1';
    search = new URLSearchParams();
    render(<RecordingFloater />);
    expect(screen.getByRole('region', { name: /gravação em andamento/i })).toBeInTheDocument();
  });

  it("shows on another patient's anamnese", () => {
    pathname = '/patients/p2';
    search = new URLSearchParams('tab=anamnese');
    render(<RecordingFloater />);
    expect(screen.getByRole('region', { name: /gravação em andamento/i })).toBeInTheDocument();
  });

  it('stops and saves', async () => {
    render(<RecordingFloater />);
    await userEvent.click(screen.getByRole('button', { name: /parar e salvar/i }));
    expect(stopAndSave).toHaveBeenCalledTimes(1);
  });

  it('discards only after confirming in the dialog', async () => {
    render(<RecordingFloater />);
    await userEvent.click(screen.getByRole('button', { name: /^descartar$/i }));
    expect(discard).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/descartar esta gravação/i);

    await userEvent.click(within(dialog).getByRole('button', { name: /^descartar$/i }));
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it('shows an uploading notice without actions while saving', () => {
    api = recordingApi({ state: { status: 'uploading', patientId: 'p1', patientName: 'Maria' } });
    render(<RecordingFloater />);
    expect(screen.getByText(/enviando gravação/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /parar e salvar/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/recording/recording-floater.test.tsx`
Expected: FAIL — `Failed to resolve import "./recording-floater"`.

- [ ] **Step 3: Implementar o floater**

`src/components/recording/recording-floater.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { DiscardRecordingDialog } from './discard-recording-dialog';
import { fmtElapsed } from './format';
import { useRecording } from './recording-provider';

// Barras do medidor no floater: as mais recentes, para caber numa pílula.
const FLOATER_BARS = 8;

// Controle da gravação fora da aba Anamnese do paciente gravado. Não inicia
// gravações: o início fica na Anamnese, junto do consentimento do paciente.
export function RecordingFloater() {
  const rec = useRecording();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  if (rec.state.status === 'idle') return null;
  const { patientId, patientName } = rec.state;
  const onItsAnamnese =
    pathname === `/patients/${patientId}` && searchParams.get('tab') === 'anamnese';
  if (onItsAnamnese) return null;

  return (
    <div
      role="region"
      aria-label="Gravação em andamento"
      className="fixed inset-x-4 bottom-4 z-50 flex flex-wrap items-center justify-center gap-3 rounded-2xl border bg-card px-4 py-2 shadow-lg md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:rounded-full"
    >
      <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
      {rec.state.status === 'uploading' ? (
        <span className="text-sm">Enviando gravação…</span>
      ) : (
        <>
          <span className="text-sm font-medium">Gravando · {patientName}</span>
          <span role="timer" aria-live="off" aria-label="Tempo de gravação" className="font-mono text-sm tabular-nums">
            {fmtElapsed(rec.elapsedSec)}
          </span>
          <span aria-hidden className="flex h-5 items-end gap-[2px]">
            {rec.levels.slice(-FLOATER_BARS).map((level, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-primary/70"
                style={{ height: `${Math.max(12, level * 100)}%` }}
              />
            ))}
          </span>
          <Link
            href={`/patients/${patientId}?tab=anamnese`}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Abrir anamnese
          </Link>
          <Button type="button" size="sm" className="rounded-full" onClick={rec.stopAndSave}>
            Parar e salvar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full text-destructive"
            onClick={() => setConfirmingDiscard(true)}
          >
            Descartar
          </Button>
        </>
      )}

      <DiscardRecordingDialog
        open={confirmingDiscard}
        onOpenChange={setConfirmingDiscard}
        elapsedSec={rec.elapsedSec}
        onConfirm={() => {
          setConfirmingDiscard(false);
          rec.discard();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/components/recording`
Expected: PASS.

- [ ] **Step 5: Montar no layout**

Em `src/app/(app)/layout.tsx`:

```tsx
import { Suspense } from 'react';
import { RecordingFloater } from '@/components/recording/recording-floater';
import { RecordingProvider } from '@/components/recording/recording-provider';
```

Envolver `<SidebarProvider>…</SidebarProvider>` com `<RecordingProvider>` (dentro de `<Providers>`, que dá o QueryClient), e ao lado de `<CornerWidgets />`:

```tsx
            <CornerWidgets />
            {/* useSearchParams exige Suspense no App Router. */}
            <Suspense fallback={null}>
              <RecordingFloater />
            </Suspense>
```

- [ ] **Step 6: Verificação completa**

Run (em `apps/web`):
- `npx vitest run` — Expected: todos passam.
- `npx tsc --noEmit` — Expected: só os 8 erros que já existiam (em `first-run-host.test.tsx`, `hub-view.test.tsx`, `ai-generate-dialog.test.tsx`); nenhum em `recording/`, `consultation-audio-section*`, `patient-detail*` ou `layout.tsx`.
- `npx eslint src/components/recording src/components/patients/consultation-audio-section.tsx src/app/\(app\)/layout.tsx` — Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/recording apps/web/src/app/\(app\)/layout.tsx
git commit -m "feat(web): floater de gravação em andamento fora da anamnese"
```

- [ ] **Step 8: QA manual (navegador real, `pnpm --filter web dev`)**

1. Paciente A → Anamnese → marcar consentimento → Gravar. Falar alguns segundos (medidor mexe).
2. Ir para Agenda: floater aparece no centro inferior com "Gravando · A" e cronômetro contínuo.
3. Abrir paciente B → Anamnese: floater visível; seção mostra "Há uma gravação em andamento de A" sem botão Gravar.
4. "Abrir anamnese" no floater → volta para A, floater some, controles de gravação na seção.
5. Ir para outra página → Parar e salvar no floater → toast "Gravação salva." → voltar a A: áudio na lista.
6. Gravar de novo e apertar F5: navegador pede confirmação.
7. Janela estreita (≤ 400px): floater cabe na largura sem rolagem horizontal.
