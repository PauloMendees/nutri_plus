import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgendaList } from './agenda-list';

function appt(id: string, dt: string, title: string) {
  const s = new Date(dt);
  return {
    id,
    nutritionistId: 'n1',
    patientId: null,
    title,
    description: null,
    startsAt: s.toISOString(),
    endsAt: new Date(s.getTime() + 30 * 60000).toISOString(),
    createdAt: '',
    updatedAt: '',
    patient: null,
  };
}

describe('AgendaList', () => {
  it('shows an empty state when there are no appointments', () => {
    render(<AgendaList appointments={[]} onEditAppointment={() => {}} />);
    expect(screen.getByText(/nenhum agendamento/i)).toBeInTheDocument();
  });

  it('shows a "Novo agendamento" CTA when onCreate is provided and calls it on click', async () => {
    const onCreate = vi.fn();
    render(<AgendaList appointments={[]} onCreate={onCreate} onEditAppointment={() => {}} />);
    const btn = screen.getByRole('button', { name: /novo agendamento/i });
    await userEvent.click(btn);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('groups appointments under a day heading and edits on click', async () => {
    const onEdit = vi.fn();
    render(
      <AgendaList
        appointments={[appt('a1', '2026-06-23T09:00:00', 'Consulta')]}
        today={new Date(2026, 5, 23)}
        onEditAppointment={onEdit}
      />,
    );
    expect(screen.getByText(/23 de junho/i)).toBeInTheDocument();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Consulta'));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });
});
