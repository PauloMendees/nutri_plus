import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarMonth } from './calendar-month';

function appt(id: string, dateTime: string, title: string) {
  const start = new Date(dateTime);
  const end = new Date(start.getTime() + 30 * 60000);
  return {
    id,
    nutritionistId: 'n1',
    patientId: null,
    title,
    description: null,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    createdAt: '',
    updatedAt: '',
    patient: null,
  };
}

const noop = () => {};

describe('CalendarMonth', () => {
  it('renders a chip with the start time + title', () => {
    render(
      <CalendarMonth
        year={2026}
        month={5}
        today={new Date(2026, 5, 23)}
        appointments={[appt('a1', '2026-06-23T09:00:00', 'Consulta')]}
        onCreateOnDay={noop}
        onEditAppointment={noop}
        onOpenDay={noop}
      />,
    );
    expect(screen.getByText(/Consulta/)).toBeInTheDocument();
  });

  it('shows 2 chips + "+N mais" when a day has more than 3 appointments', () => {
    const four = ['08:00', '09:00', '10:00', '11:00'].map((t, i) =>
      appt(`a${i}`, `2026-06-23T${t}:00`, `Ev${i}`),
    );
    render(
      <CalendarMonth
        year={2026}
        month={5}
        today={new Date(2026, 5, 23)}
        appointments={four}
        onCreateOnDay={noop}
        onEditAppointment={noop}
        onOpenDay={noop}
      />,
    );
    expect(screen.getByText('+2 mais')).toBeInTheDocument();
  });

  it('calls onEditAppointment when a chip is clicked', async () => {
    const onEdit = vi.fn();
    render(
      <CalendarMonth
        year={2026}
        month={5}
        today={new Date(2026, 5, 23)}
        appointments={[appt('a1', '2026-06-23T09:00:00', 'Consulta')]}
        onCreateOnDay={noop}
        onEditAppointment={onEdit}
        onOpenDay={noop}
      />,
    );
    await userEvent.click(screen.getByText(/Consulta/));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('calls onCreateOnDay when an empty day cell is clicked', async () => {
    const onCreate = vi.fn();
    render(
      <CalendarMonth
        year={2026}
        month={5}
        today={new Date(2026, 5, 23)}
        appointments={[]}
        onCreateOnDay={onCreate}
        onEditAppointment={noop}
        onOpenDay={noop}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '15' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect((onCreate.mock.calls[0][0] as Date).getDate()).toBe(15);
  });
});
