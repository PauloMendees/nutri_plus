import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';

const push = vi.fn();
const mutateAsync = vi.fn();
const isPlayCadastroSubmit = vi.fn(() => false);
const notifyChapterActionSucceeded = vi.fn(() => Promise.resolve());
const exit = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('@/lib/queries/patients', () => ({
  useCreatePatient: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('@/components/onboarding/tour-provider', () => ({
  useTour: () => ({
    start: vi.fn(),
    exit,
    skipChapter: vi.fn(),
    isPlayCadastroSubmit,
    notifyChapterActionSucceeded,
  }),
}));

import { CreatePatientForm } from './create-patient-form';

beforeEach(() => {
  push.mockReset();
  mutateAsync.mockReset();
  exit.mockReset();
  notifyChapterActionSucceeded.mockReset().mockResolvedValue(undefined);
  isPlayCadastroSubmit.mockReset().mockReturnValue(false);
});

describe('CreatePatientForm', () => {
  it('blocks submit and shows errors when name/email are missing', async () => {
    render(<CreatePatientForm />);
    await userEvent.click(screen.getByRole('button', { name: /criar paciente/i }));
    expect(await screen.findByText(/informe o nome/i)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('creates the patient and redirects to its page with ?created=1', async () => {
    mutateAsync.mockResolvedValue({ id: 'p-new' });
    render(<CreatePatientForm />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Maria Silva');
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'maria@x.com');
    await userEvent.click(screen.getByRole('button', { name: /criar paciente/i }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Maria Silva', email: 'maria@x.com' }),
      ),
    );
    expect(mutateAsync.mock.calls[0][0].demo).toBeUndefined();
    expect(notifyChapterActionSucceeded).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/patients/p-new?created=1');
  });

  it('marks the submit button with the tour anchor', () => {
    render(<CreatePatientForm />);
    expect(screen.getByRole('button', { name: /criar paciente/i })).toHaveAttribute(
      'data-tour',
      'patients.create.submit',
    );
  });

  it('sends demo: true on submit while the cadastro play step is active', async () => {
    isPlayCadastroSubmit.mockReturnValue(true);
    mutateAsync.mockResolvedValue({ id: 'p-demo' });
    render(<CreatePatientForm />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Maria Demonstração');
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'demo.web@example.com');
    await userEvent.click(screen.getByRole('button', { name: /criar paciente/i }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ demo: true })),
    );
    expect(notifyChapterActionSucceeded).toHaveBeenCalledWith({ demoPatientId: 'p-demo' });
    expect(push).not.toHaveBeenCalled();
  });

  it('does not notify the tour when creation fails', async () => {
    isPlayCadastroSubmit.mockReturnValue(true);
    mutateAsync.mockRejectedValue(new ApiError(409, {}));
    render(<CreatePatientForm />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Maria Silva');
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'maria@x.com');
    await userEvent.click(screen.getByRole('button', { name: /criar paciente/i }));
    expect(await screen.findByText(/já existe/i)).toBeInTheDocument();
    expect(notifyChapterActionSucceeded).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows the API message when invite is rejected', async () => {
    mutateAsync.mockRejectedValue(
      new ApiError(422, {
        message: 'Use um e-mail que receba mensagens. Endereços de exemplo (example.com) não podem receber o convite.',
      }),
    );
    render(<CreatePatientForm />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Maria Silva');
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'maria@example.com');
    await userEvent.click(screen.getByRole('button', { name: /criar paciente/i }));
    expect(await screen.findByText(/e-mail que receba mensagens/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a mapped error when creation fails', async () => {
    mutateAsync.mockRejectedValue(new ApiError(409, {}));
    render(<CreatePatientForm />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Maria Silva');
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'maria@x.com');
    await userEvent.click(screen.getByRole('button', { name: /criar paciente/i }));
    expect(await screen.findByText(/já existe/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
