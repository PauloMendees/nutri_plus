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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/queries/subscription', () => ({
  useSubscription: () => ({ data: { entitlements: { features: { transcription: true } } } }),
}));

import { ConsultationAudioSection } from './consultation-audio-section';

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

beforeEach(() => {
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
});
