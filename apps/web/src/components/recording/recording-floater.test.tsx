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
