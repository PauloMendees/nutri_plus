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

describe('ConsultationAudioSection', () => {
  it('renders the list with an <audio> using the fixture signedUrl', () => {
    const { container } = renderWithRecording(<Section />);
    const player = container.querySelector('audio');
    expect(player).toHaveAttribute('src', audio().signedUrl);
  });

  it('disables "Gravar" until the consent checkbox is checked', async () => {
    renderWithRecording(<Section />);
    const recordButton = screen.getByRole('button', { name: /gravar/i });
    expect(recordButton).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));
    expect(recordButton).toBeEnabled();
  });

  it('hides the recorder and delete controls when canEdit is false', () => {
    renderWithRecording(<Section canEdit={false} />);
    expect(screen.queryByRole('button', { name: /gravar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument();
  });

  it('asks for confirmation before deleting, then calls the delete mutation with the audio id', async () => {
    renderWithRecording(<Section />);

    await userEvent.click(screen.getByRole('button', { name: 'Excluir gravação' }));
    expect(mutateAsync).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /confirmar exclusão da gravação/i }));

    expect(mutateAsync).toHaveBeenCalledWith(audio().id);
  });

  it('shows a "Transcrever" button when the audio has no transcript status', () => {
    useAudiosMock.mockReturnValue({ data: [audio({ transcriptStatus: null })], isLoading: false });
    renderWithRecording(<Section />);
    expect(screen.getByRole('button', { name: /transcrever/i })).toBeInTheDocument();
  });

  it('shows "Transcrevendo…" while PROCESSING', () => {
    useAudiosMock.mockReturnValue({ data: [audio({ transcriptStatus: 'PROCESSING' })], isLoading: false });
    renderWithRecording(<Section />);
    expect(screen.getByText(/transcrevendo/i)).toBeInTheDocument();
  });

  it('renders the transcript text when DONE', () => {
    useAudiosMock.mockReturnValue({
      data: [audio({ transcriptStatus: 'DONE', transcript: 'paciente relatou dor' })], isLoading: false,
    });
    renderWithRecording(<Section />);
    expect(screen.getByText('paciente relatou dor')).toBeInTheDocument();
  });

  it('offers "Tentar de novo" when FAILED and triggers the mutation', async () => {
    useAudiosMock.mockReturnValue({ data: [audio({ transcriptStatus: 'FAILED' })], isLoading: false });
    renderWithRecording(<Section />);
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(transcribeMock).toHaveBeenCalledWith('a1');
  });

  it('offers "Tentar de novo" when PROCESSING (stuck row) and triggers the mutation', async () => {
    useAudiosMock.mockReturnValue({ data: [audio({ transcriptStatus: 'PROCESSING' })], isLoading: false });
    renderWithRecording(<Section />);
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(transcribeMock).toHaveBeenCalledWith('a1');
  });

  it('mostra cronômetro e medidor de áudio enquanto grava', async () => {
    renderWithRecording(<Section />);
    await startRecording();

    expect(screen.getByRole('timer', { name: /tempo de gravação/i })).toHaveTextContent(/^\d{2}:\d{2}$/);
    expect(screen.getByTestId('audio-meter')).toBeInTheDocument();
  });

  it('descarta a gravação sem enviar, depois de confirmar no diálogo', async () => {
    renderWithRecording(<Section />);
    await startRecording();

    await userEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));
    // Só abrir o diálogo não pode parar nem enviar nada. O modal deixa o fundo
    // inerte, então a checagem é sobre o diálogo, não sobre o botão de trás.
    expect(screen.getByRole('dialog')).toHaveTextContent(/descartar esta gravação/i);
    expect(uploadAudio).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /^descartar$/i }));

    expect(uploadAudio).not.toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^gravar$/i })).toBeInTheDocument();
  });

  it('"Continuar gravando" fecha o diálogo e mantém a gravação viva', async () => {
    renderWithRecording(<Section />);
    await startRecording();

    await userEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));
    await userEvent.click(screen.getByRole('button', { name: /continuar gravando/i }));

    expect(screen.getByRole('button', { name: /parar gravação/i })).toBeInTheDocument();
    expect(uploadAudio).not.toHaveBeenCalled();
  });

  it('parar normalmente envia o áudio do paciente', async () => {
    renderWithRecording(<Section />);
    const stop = await startRecording();

    await userEvent.click(stop);

    await waitFor(() => expect(uploadAudio).toHaveBeenCalledTimes(1));
    expect(uploadAudio).toHaveBeenCalledWith('p1', expect.objectContaining({ filename: 'consulta.webm' }));
  });

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
});
