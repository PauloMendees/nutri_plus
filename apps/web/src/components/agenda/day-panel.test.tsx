import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayPanel } from './day-panel';

const appt = {
  id: 'a1',
  nutritionistId: 'n1',
  patientId: null,
  title: 'Consulta',
  description: null,
  startsAt: new Date(2026, 5, 17, 10, 0).toISOString(),
  endsAt: new Date(2026, 5, 17, 10, 45).toISOString(),
  createdAt: '',
  updatedAt: '',
  patient: null,
};

describe('DayPanel', () => {
  it('lists the day appointments and creates for that day', async () => {
    const onCreate = vi.fn();
    render(
      <DayPanel
        open
        onOpenChange={() => {}}
        date={new Date(2026, 5, 17)}
        appointments={[appt]}
        onEditAppointment={() => {}}
        onCreateOnDay={onCreate}
      />,
    );
    // Target the row button by role (the tooltip also renders the title text).
    expect(screen.getByRole('button', { name: /consulta/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /novo agendamento neste dia/i }));
    expect((onCreate.mock.calls[0][0] as Date).getDate()).toBe(17);
  });

  it('calls onEditAppointment when an appointment row is clicked', async () => {
    const onEdit = vi.fn();
    render(
      <DayPanel
        open
        onOpenChange={() => {}}
        date={new Date(2026, 5, 17)}
        appointments={[appt]}
        onEditAppointment={onEdit}
        onCreateOnDay={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /consulta/i }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });
});
