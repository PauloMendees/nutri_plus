import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getUserMedia, installMediaMocks, media, recorderOptions, trackStop } from './test-media';

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

  it('releases the mic and does not resume start if the provider unmounts while getUserMedia is pending', async () => {
    let resolveGetUserMedia!: (stream: unknown) => void;
    getUserMedia.mockReset().mockReturnValue(
      new Promise((resolve) => { resolveGetUserMedia = resolve; }),
    );
    const { result, unmount } = setup();

    const startPromise = result.current.start(target);
    unmount();
    resolveGetUserMedia({ getTracks: () => [{ stop: trackStop }] });

    expect(await startPromise).toBe(false);
    expect(trackStop).toHaveBeenCalled();
    expect(recorderOptions.length).toBe(0);
  });

  it('throws a clear error when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useRecording())).toThrow(/RecordingProvider/);
  });

  it('ignores a stop/discard race after the recorder already stopped', async () => {
    media.deferStop = true;
    const { result } = setup();
    await act(async () => { await result.current.start(target); });

    expect(() => {
      act(() => {
        result.current.stopAndSave();
        result.current.stopAndSave();
        result.current.discard();
      });
    }).not.toThrow();

    await waitFor(() => expect(uploadAudio).toHaveBeenCalledTimes(1));
    expect(toast.info).not.toHaveBeenCalledWith('Gravação descartada.');
  });
});
