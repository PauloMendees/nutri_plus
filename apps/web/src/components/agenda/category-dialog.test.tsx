import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const createMut = vi.fn();
const updateMut = vi.fn();
const deleteMut = vi.fn();

vi.mock('@/lib/queries/appointment-categories', () => ({
  useCreateAppointmentCategory: () => ({ mutateAsync: createMut, isPending: false }),
  useUpdateAppointmentCategory: () => ({ mutateAsync: updateMut, isPending: false }),
  useDeleteAppointmentCategory: () => ({ mutateAsync: deleteMut, isPending: false }),
}));

import { CategoryDialog } from './category-dialog';

beforeEach(() => {
  createMut.mockReset().mockResolvedValue({});
  updateMut.mockReset().mockResolvedValue({});
  deleteMut.mockReset().mockResolvedValue(undefined);
});

const onOpenChange = vi.fn();

describe('CategoryDialog', () => {
  it('creates a category with the typed name', async () => {
    render(<CategoryDialog open onOpenChange={onOpenChange} />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Consulta');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(createMut).toHaveBeenCalledTimes(1));
    expect(createMut.mock.calls[0][0].name).toBe('Consulta');
  });

  it('prefills and edits an existing category, and can delete it', async () => {
    const category = {
      id: 'c1',
      nutritionistId: 'n1',
      name: 'Retorno',
      color: '#3B82F6',
      isDefault: true,
      createdAt: '',
      updatedAt: '',
    };
    render(<CategoryDialog open onOpenChange={onOpenChange} category={category} />);
    expect(screen.getByLabelText(/nome/i)).toHaveValue('Retorno');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1));
    expect(updateMut.mock.calls[0][0].id).toBe('c1');

    await userEvent.click(screen.getByRole('button', { name: /excluir/i }));
    await waitFor(() => expect(deleteMut).toHaveBeenCalledWith('c1'));
  });
});
