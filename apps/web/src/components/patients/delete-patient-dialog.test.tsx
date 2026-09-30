import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';

const mutateAsync = vi.fn();
const pendingState = { isPending: false };
vi.mock('@/lib/queries/patients', () => ({
  useDeletePatient: () => ({ mutateAsync, isPending: pendingState.isPending }),
}));
const exportPatientData = vi.fn();
vi.mock('@/lib/api/patients', () => ({ exportPatientData: (...a: unknown[]) => exportPatientData(...a) }));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { DeletePatientDialog } from './delete-patient-dialog';

const withEmail = { id: 'p1', name: 'Maria Silva', email: 'maria@x.com' };
const noEmail = { ...withEmail, email: null };

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue(undefined);
  exportPatientData.mockReset().mockResolvedValue({ profile: { name: 'Maria Silva' } });
  push.mockReset();
  pendingState.isPending = false;
  Object.values(toast).forEach((f) => f.mockReset());
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

describe('DeletePatientDialog', () => {
  it('says the data copy goes to the patient e-mail', () => {
    render(<DeletePatientDialog patient={withEmail} open onOpenChange={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('maria@x.com');
  });

  it('keeps the delete button disabled until the name matches', async () => {
    render(<DeletePatientDialog patient={withEmail} open onOpenChange={() => {}} />);
    const btn = screen.getByRole('button', { name: /excluir definitivamente/i });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/digite o nome do paciente/i), 'Maria Souza');
    expect(btn).toBeDisabled();
    await userEvent.clear(screen.getByLabelText(/digite o nome do paciente/i));
    await userEvent.type(screen.getByLabelText(/digite o nome do paciente/i), '  maria SILVA ');
    expect(btn).toBeEnabled();
  });

  it('deletes, confirms and goes back to the list', async () => {
    render(<DeletePatientDialog patient={withEmail} open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByLabelText(/digite o nome do paciente/i), 'Maria Silva');
    await userEvent.click(screen.getByRole('button', { name: /excluir definitivamente/i }));
    expect(mutateAsync).toHaveBeenCalledWith({ id: 'p1', confirmName: 'Maria Silva' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/patients'));
    expect(toast.success).toHaveBeenCalledWith('Paciente excluído.');
  });

  it('shows that nothing was deleted when the e-mail fails (502)', async () => {
    mutateAsync.mockRejectedValue(new ApiError(502, 'x'));
    render(<DeletePatientDialog patient={withEmail} open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByLabelText(/digite o nome do paciente/i), 'Maria Silva');
    await userEvent.click(screen.getByRole('button', { name: /excluir definitivamente/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Não foi possível enviar o e-mail com os dados; nada foi excluído.'),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('disables the delete button while the request is pending', async () => {
    const { rerender } = render(<DeletePatientDialog patient={withEmail} open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByLabelText(/digite o nome do paciente/i), 'Maria Silva');
    expect(screen.getByRole('button', { name: /excluir definitivamente/i })).toBeEnabled();
    pendingState.isPending = true;
    rerender(<DeletePatientDialog patient={withEmail} open onOpenChange={() => {}} />);
    expect(screen.getByRole('button', { name: /excluindo/i })).toBeDisabled();
  });

  it('clears the typed name when the dialog is closed and reopened', async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen(true)}>reabrir</button>
          <DeletePatientDialog patient={withEmail} open={open} onOpenChange={setOpen} />
        </>
      );
    }
    render(<Harness />);
    await userEvent.type(screen.getByLabelText(/digite o nome do paciente/i), 'Maria Silva');
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /reabrir/i }));
    expect(screen.getByLabelText(/digite o nome do paciente/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /excluir definitivamente/i })).toBeDisabled();
  });

  it('offers a download when the patient has no e-mail', async () => {
    // jsdom não implementa navegação por <a download>; sem o stub imprime "Not implemented".
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<DeletePatientDialog patient={noEmail} open onOpenChange={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveTextContent(/não tem e-mail cadastrado/i);
    await userEvent.click(screen.getByRole('button', { name: /baixar dados/i }));
    expect(exportPatientData).toHaveBeenCalledWith('p1');
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    click.mockRestore();
  });
});
