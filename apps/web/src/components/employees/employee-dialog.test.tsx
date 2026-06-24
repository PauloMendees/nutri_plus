import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const inviteMut = vi.fn();
const updateMut = vi.fn();
const deleteMut = vi.fn();

vi.mock('@/lib/queries/employees', () => ({
  useInviteEmployee: () => ({ mutateAsync: inviteMut, isPending: false }),
  useUpdateEmployee: () => ({ mutateAsync: updateMut, isPending: false }),
  useDeleteEmployee: () => ({ mutateAsync: deleteMut, isPending: false }),
}));

import { EmployeeDialog } from './employee-dialog';
import { ApiError } from '@/lib/api/client';

const onOpenChange = vi.fn();

const employee = {
  id: 'e1',
  userId: 'u1',
  nutritionistId: 'n1',
  user: { id: 'u1', name: 'Ana Paula', email: 'ana@x.com' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  inviteMut.mockReset().mockResolvedValue({});
  updateMut.mockReset().mockResolvedValue({});
  deleteMut.mockReset().mockResolvedValue(undefined);
  onOpenChange.mockReset();
});

describe('EmployeeDialog', () => {
  it('create: invites with the typed name and email', async () => {
    render(<EmployeeDialog open onOpenChange={onOpenChange} />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Ana Paula');
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@x.com');
    await userEvent.click(screen.getByRole('button', { name: /enviar convite/i }));

    await waitFor(() => expect(inviteMut).toHaveBeenCalledTimes(1));
    expect(inviteMut.mock.calls[0][0]).toEqual({ name: 'Ana Paula', email: 'ana@x.com' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('edit: prefills the name, shows the email read-only, and updates the name', async () => {
    render(<EmployeeDialog open onOpenChange={onOpenChange} employee={employee} />);
    expect(screen.getByLabelText(/nome/i)).toHaveValue('Ana Paula');

    const email = screen.getByDisplayValue('ana@x.com');
    expect(email).toBeDisabled();

    const nameInput = screen.getByLabelText(/nome/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Ana B');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1));
    expect(updateMut.mock.calls[0][0]).toEqual({ id: 'e1', body: { name: 'Ana B' } });
  });

  it('edit: deleting requires inline confirmation, then removes', async () => {
    render(<EmployeeDialog open onOpenChange={onOpenChange} employee={employee} />);
    await userEvent.click(screen.getByRole('button', { name: /excluir/i }));
    expect(screen.getByText(/não pode ser desfeita/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^remover$/i }));
    await waitFor(() => expect(deleteMut).toHaveBeenCalledWith('e1'));
  });

  it('create: shows a friendly message on a 409 conflict and stays open', async () => {
    inviteMut.mockRejectedValue(new ApiError(409, null));
    render(<EmployeeDialog open onOpenChange={onOpenChange} />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Ana Paula');
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'ana@x.com');
    await userEvent.click(screen.getByRole('button', { name: /enviar convite/i }));

    expect(await screen.findByText(/já existe um usuário/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
