import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';

const createMut = vi.fn();
const updateMut = vi.fn();
const deleteMut = vi.fn();

vi.mock('@/lib/queries/appointments', () => ({
  useCreateAppointment: () => ({ mutateAsync: createMut, isPending: false }),
  useUpdateAppointment: () => ({ mutateAsync: updateMut, isPending: false }),
  useDeleteAppointment: () => ({ mutateAsync: deleteMut, isPending: false }),
}));
vi.mock('@/lib/queries/patients', () => ({
  usePatients: () => ({ data: [], isLoading: false }),
}));

const categoriesQuery = vi.fn();
vi.mock("@/lib/queries/appointment-categories", () => ({
  useAppointmentCategories: () => categoriesQuery(),
}));

import { AppointmentDialog } from './appointment-dialog';

beforeEach(() => {
  createMut.mockReset().mockResolvedValue({});
  updateMut.mockReset().mockResolvedValue({});
  deleteMut.mockReset().mockResolvedValue(undefined);
  onOpenChange.mockReset();
  categoriesQuery.mockReset().mockReturnValue({ data: [] });
});

const onOpenChange = vi.fn();

describe('AppointmentDialog (create)', () => {
  it('creates with ISO start/end built from the date + times', async () => {
    render(
      <AppointmentDialog
        open
        onOpenChange={onOpenChange}
        mode="create"
        initialDate={new Date(2026, 5, 23)}
      />,
    );
    await userEvent.type(screen.getByLabelText(/título/i), 'Consulta');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(createMut).toHaveBeenCalledTimes(1));
    const body = createMut.mock.calls[0][0];
    expect(body.title).toBe('Consulta');
    expect(new Date(body.startsAt).getHours()).toBe(9);
    expect(new Date(body.endsAt).getHours()).toBe(10);
    expect(body.startsAt < body.endsAt).toBe(true);
  });

  it('shows the overlap message on a 409', async () => {
    createMut.mockRejectedValue(new ApiError(409, { message: 'overlap' }));
    render(
      <AppointmentDialog open onOpenChange={onOpenChange} mode="create" initialDate={new Date(2026, 5, 23)} />,
    );
    await userEvent.type(screen.getByLabelText(/título/i), 'Consulta');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    expect(await screen.findByText(/já existe um agendamento nesse horário/i)).toBeInTheDocument();
  });
});

describe('AppointmentDialog (edit)', () => {
  const appt = {
    id: 'a1',
    nutritionistId: 'n1',
    patientId: null,
    title: 'Retorno',
    description: null,
    startsAt: new Date(2026, 5, 25, 15, 0).toISOString(),
    endsAt: new Date(2026, 5, 25, 15, 45).toISOString(),
    createdAt: '',
    updatedAt: '',
    patient: null,
  };

  it('prefills and updates with changed fields', async () => {
    render(<AppointmentDialog open onOpenChange={onOpenChange} mode="edit" appointment={appt} />);
    expect(screen.getByLabelText(/título/i)).toHaveValue('Retorno');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1));
    const call = updateMut.mock.calls[0][0];
    expect(call.id).toBe('a1');
    expect(call.body.description).toBeNull();
    expect(call.body.patientId).toBeNull();
    expect(new Date(call.body.startsAt).getHours()).toBe(15);
  });

  it('deletes the appointment', async () => {
    render(<AppointmentDialog open onOpenChange={onOpenChange} mode="edit" appointment={appt} />);
    await userEvent.click(screen.getByRole('button', { name: /excluir/i }));
    await waitFor(() => expect(deleteMut).toHaveBeenCalledWith('a1'));
  });
});

describe('AppointmentDialog (category)', () => {
  it("preselects the default category and fills the title on create", async () => {
    categoriesQuery.mockReturnValue({
      data: [
        { id: "cat-default", nutritionistId: "n1", name: "Consulta", color: "#14BFA6", isDefault: true, createdAt: "", updatedAt: "" },
      ],
    });
    render(
      <AppointmentDialog open onOpenChange={onOpenChange} mode="create" initialDate={new Date(2026, 5, 23)} />,
    );
    await waitFor(() => expect(screen.getByLabelText(/título/i)).toHaveValue("Consulta"));
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(createMut).toHaveBeenCalledTimes(1));
    expect(createMut.mock.calls[0][0].categoryId).toBe("cat-default");
  });
});
