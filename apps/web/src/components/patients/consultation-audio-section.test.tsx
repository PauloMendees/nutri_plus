import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConsultationAudio } from '@nutri-plus/shared-types';

const useAudiosMock = vi.fn();
const mutate = vi.fn();
const mutateAsync = vi.fn();

vi.mock('@/lib/queries/consultation-audio', () => ({
  useAudios: (...args: unknown[]) => useAudiosMock(...args),
  useUploadAudio: () => ({ mutate, mutateAsync, isPending: false }),
  useDeleteAudio: () => ({ mutate, mutateAsync, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
    ...over,
  };
}

beforeEach(() => {
  useAudiosMock.mockReset().mockReturnValue({ data: [audio()], isLoading: false });
  mutate.mockReset();
  mutateAsync.mockReset().mockResolvedValue(audio());
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
});
