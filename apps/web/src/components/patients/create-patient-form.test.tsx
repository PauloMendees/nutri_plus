import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';

const push = vi.fn();
const mutateAsync = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('@/lib/queries/patients', () => ({
  useCreatePatient: () => ({ mutateAsync, isPending: false }),
}));

import { CreatePatientForm } from './create-patient-form';

beforeEach(() => {
  push.mockReset();
  mutateAsync.mockReset();
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
    expect(push).toHaveBeenCalledWith('/patients/p-new?created=1');
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
