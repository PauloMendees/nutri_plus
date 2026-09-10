import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';

const push = vi.fn();
const mutateAsync = vi.fn();
const isPlayDemoSubmit = vi.fn(() => false);
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
    isPlayDemoSubmit,
    notifyChapterActionSucceeded,
  }),
}));

import { CreatePatientForm } from './create-patient-form';

beforeEach(() => {
  push.mockReset();
  mutateAsync.mockReset();
  exit.mockReset();
  notifyChapterActionSucceeded.mockReset().mockResolvedValue(undefined);
  isPlayDemoSubmit.mockReset().mockReturnValue(false);
});

describe('CreatePatientForm', () => {
  it('blocks submit and shows errors when name is missing', async () => {
    render(<CreatePatientForm />);
    await userEvent.click(screen.getByRole('button', { name: /criar paciente/i }));
    expect(await screen.findByText(/informe o nome/i)).toBeInTheDocument();
    expect(screen.queryByText(/informe um e-mail/i)).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('labels email without an asterisk and explains that invite is sent later', () => {
    render(<CreatePatientForm />);
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.queryByText('E-mail *')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Telefone')).toBeInTheDocument();
    expect(
      screen.getByText('O convite do app é enviado depois, na ficha, quando houver e-mail.'),
    ).toBeInTheDocument();
  });

  it('submits with only a name and no required-email error', async () => {
    mutateAsync.mockResolvedValue({ id: 'p-new' });
    render(<CreatePatientForm />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Maria Silva');
    await userEvent.click(screen.getByRole('button', { name: /criar paciente/i }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ name: 'Maria Silva' })),
    );
    expect(mutateAsync.mock.calls[0][0].email).toBeUndefined();
    expect(screen.queryByText(/informe um e-mail/i)).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledWith('/patients/p-new?created=1');
  });

  it('creates the patient and redirects to its page with ?created=1', async () => {
    mutateAsync.mockResolvedValue({ id: 'p-new' });
    render(<CreatePatientForm />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Maria Silva');
    await userEvent.type(screen.getByLabelText(/^e-mail$/i), 'maria@x.com');
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

  it('hides the fictional-data control outside the cadastro tour', () => {
    render(<CreatePatientForm />);
    expect(screen.queryByRole('button', { name: /preencher com dados fictícios/i })).not.toBeInTheDocument();
  });

  it('fills the form from Preencher com dados fictícios during the cadastro tour', async () => {
    isPlayDemoSubmit.mockReturnValue(true);
    render(<CreatePatientForm />);
    await userEvent.click(screen.getByRole('button', { name: /preencher com dados fictícios/i }));
    expect(screen.getByLabelText(/nome/i)).toHaveValue('Maria Demonstração');
    expect((screen.getByLabelText(/^e-mail$/i) as HTMLInputElement).value).not.toMatch(/example\.com/);
  });

  it('marks the submit button with the tour anchor', () => {
    render(<CreatePatientForm />);
    expect(screen.getByRole('button', { name: /criar paciente/i })).toHaveAttribute(
      'data-tour',
      'patients.create.submit',
    );
  });

  it('sends demo: true on submit while the cadastro play step is active', async () => {
    isPlayDemoSubmit.mockReturnValue(true);
    mutateAsync.mockResolvedValue({ id: 'p-demo' });
    render(<CreatePatientForm />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Maria Demonstração');
    await userEvent.click(screen.getByRole('button', { name: /criar paciente/i }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ demo: true })),
    );
    expect(notifyChapterActionSucceeded).toHaveBeenCalledWith({ demoPatientId: 'p-demo' });
    expect(push).not.toHaveBeenCalled();
  });

  it('does not notify the tour when creation fails', async () => {
    isPlayDemoSubmit.mockReturnValue(true);
    mutateAsync.mockRejectedValue(new ApiError(409, {}));
    render(<CreatePatientForm />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Maria Silva');
    await userEvent.type(screen.getByLabelText(/^e-mail$/i), 'maria@x.com');
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
    await userEvent.type(screen.getByLabelText(/^e-mail$/i), 'maria@example.com');
    await userEvent.click(screen.getByRole('button', { name: /criar paciente/i }));
    expect(await screen.findByText(/e-mail que receba mensagens/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a mapped error when creation fails', async () => {
    mutateAsync.mockRejectedValue(new ApiError(409, {}));
    render(<CreatePatientForm />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Maria Silva');
    await userEvent.type(screen.getByLabelText(/^e-mail$/i), 'maria@x.com');
    await userEvent.click(screen.getByRole('button', { name: /criar paciente/i }));
    expect(await screen.findByText(/já existe/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
