import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConsultationAudio } from '@nutri-plus/shared-types';

const useAudiosMock = vi.fn();
const mutate = vi.fn();
const mutateAsync = vi.fn();
const transcribeMock = vi.fn();

vi.mock('@/lib/queries/consultation-audio', () => ({
  useAudios: (...args: unknown[]) => useAudiosMock(...args),
  useUploadAudio: () => ({ mutate, mutateAsync, isPending: false }),
  useDeleteAudio: () => ({ mutate, mutateAsync, isPending: false }),
  useTranscribeAudio: () => ({ mutate: transcribeMock, mutateAsync: transcribeMock, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/queries/subscription', () => ({
  useSubscription: () => ({ data: { entitlements: { features: { transcription: true } } } }),
}));

import { ConsultationAudioSection, fmtElapsed } from './consultation-audio-section';

function audio(over: Partial<ConsultationAudio> = {}): ConsultationAudio {
  return {
    id: 'a1',
    patientId: 'p1',
    mimeType: 'audio/webm',
    durationSec: 42,
    consentConfirmed: true,
    recordedAt: '2026-05-12T00:00:00.000Z',
    signedUrl: 'https://storage.example.com/consultation-audio/a1.webm?token=abc',
    transcript: null,
    transcriptStatus: null,
    transcribedAt: null,
    transcriptError: null,
    ...over,
  };
}

// jsdom não traz MediaRecorder nem getUserMedia; o dublê expõe só o que o
// componente usa (start/stop/onstop) para que o fluxo de cancelamento seja testável.
const recorderOptions: unknown[] = [];

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

const trackStop = vi.fn();

function installMediaMocks() {
  trackStop.mockReset();
  recorderOptions.length = 0;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }) },
  });
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
}

async function startRecording() {
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(screen.getByRole('button', { name: /^gravar$/i }));
  return screen.findByRole('button', { name: /parar gravação/i });
}

beforeEach(() => {
  installMediaMocks();
  useAudiosMock.mockReset().mockReturnValue({ data: [audio()], isLoading: false });
  mutate.mockReset();
  mutateAsync.mockReset().mockResolvedValue(audio());
  transcribeMock.mockReset().mockResolvedValue(undefined);
});

describe('ConsultationAudioSection', () => {
  it('renders the list with an <audio> using the fixture signedUrl', () => {
    const { container } = render(<ConsultationAudioSection patientId="p1" canEdit />);
    const player = container.querySelector('audio');
    expect(player).toHaveAttribute('src', audio().signedUrl);
  });

  it('disables "Gravar" until the consent checkbox is checked', async () => {
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    const recordButton = screen.getByRole('button', { name: /gravar/i });
    expect(recordButton).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));
    expect(recordButton).toBeEnabled();
  });

  it('hides the recorder and delete controls when canEdit is false', () => {
    render(<ConsultationAudioSection patientId="p1" canEdit={false} />);
    expect(screen.queryByRole('button', { name: /gravar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument();
  });

  it('asks for confirmation before deleting, then calls the delete mutation with the audio id', async () => {
    render(<ConsultationAudioSection patientId="p1" canEdit />);

    await userEvent.click(screen.getByRole('button', { name: 'Excluir gravação' }));
    expect(mutateAsync).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /confirmar exclusão da gravação/i }));

    expect(mutateAsync).toHaveBeenCalledWith(audio().id);
  });

  it('shows a "Transcrever" button when the audio has no transcript status', () => {
    useAudiosMock.mockReturnValue({ data: [audio({ transcriptStatus: null })], isLoading: false });
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    expect(screen.getByRole('button', { name: /transcrever/i })).toBeInTheDocument();
  });

  it('shows "Transcrevendo…" while PROCESSING', () => {
    useAudiosMock.mockReturnValue({ data: [audio({ transcriptStatus: 'PROCESSING' })], isLoading: false });
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    expect(screen.getByText(/transcrevendo/i)).toBeInTheDocument();
  });

  it('renders the transcript text when DONE', () => {
    useAudiosMock.mockReturnValue({
      data: [audio({ transcriptStatus: 'DONE', transcript: 'paciente relatou dor' })], isLoading: false,
    });
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    expect(screen.getByText('paciente relatou dor')).toBeInTheDocument();
  });

  it('offers "Tentar de novo" when FAILED and triggers the mutation', async () => {
    useAudiosMock.mockReturnValue({ data: [audio({ transcriptStatus: 'FAILED' })], isLoading: false });
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(transcribeMock).toHaveBeenCalledWith('a1');
  });

  it('offers "Tentar de novo" when PROCESSING (stuck row) and triggers the mutation', async () => {
    useAudiosMock.mockReturnValue({ data: [audio({ transcriptStatus: 'PROCESSING' })], isLoading: false });
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(transcribeMock).toHaveBeenCalledWith('a1');
  });

  it('mostra cronômetro e medidor de áudio enquanto grava', async () => {
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    await startRecording();

    expect(screen.getByRole('timer', { name: /tempo de gravação/i })).toHaveTextContent(/^\d{2}:\d{2}$/);
    expect(screen.getByTestId('audio-meter')).toBeInTheDocument();
  });

  it('descarta a gravação sem enviar, depois de confirmar no diálogo', async () => {
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    await startRecording();

    await userEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));
    // Só abrir o diálogo não pode parar nem enviar nada. O modal deixa o fundo
    // inerte, então a checagem é sobre o diálogo, não sobre o botão de trás.
    expect(screen.getByRole('dialog')).toHaveTextContent(/descartar esta gravação/i);
    expect(mutateAsync).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /^descartar$/i }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^gravar$/i })).toBeInTheDocument();
  });

  it('"Continuar gravando" fecha o diálogo e mantém a gravação viva', async () => {
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    await startRecording();

    await userEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));
    await userEvent.click(screen.getByRole('button', { name: /continuar gravando/i }));

    expect(screen.getByRole('button', { name: /parar gravação/i })).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('parar normalmente envia o áudio', async () => {
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    const stop = await startRecording();

    await userEvent.click(stop);

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ filename: 'consulta.webm' });
  });
});

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

  it('grava em 32 kbps para caber no limite da transcrição', async () => {
    render(<ConsultationAudioSection patientId="p1" canEdit />);
    await startRecording();

    // No padrão do navegador (~129 kbps) uma consulta de 30 min passa de 25 MB
    // e a API de transcrição recusa o arquivo inteiro.
    expect(recorderOptions[0]).toEqual({ audioBitsPerSecond: 32_000 });
  });
});
