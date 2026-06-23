import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useAppointments = vi.fn();
vi.mock('@/lib/queries/appointments', () => ({
  useAppointments: (...a: unknown[]) => useAppointments(...a),
  useCreateAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/queries/patients', () => ({ usePatients: () => ({ data: [] }) }));

import { AgendaView } from './agenda-view';

beforeEach(() => {
  useAppointments.mockReset().mockReturnValue({ data: [], isLoading: false, isError: false });
});

describe('AgendaView', () => {
  it('shows the month title and toggles to the list view', async () => {
    render(<AgendaView today={new Date(2026, 5, 23)} />);
    expect(screen.getByText('Junho 2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /lista/i }));
    expect(screen.getByText(/nenhum agendamento/i)).toBeInTheDocument();
  });

  it('navigates to the next month', async () => {
    render(<AgendaView today={new Date(2026, 5, 23)} />);
    await userEvent.click(screen.getByRole('button', { name: /próximo mês/i }));
    expect(screen.getByText('Julho 2026')).toBeInTheDocument();
  });

  it('opens the create dialog from the header button', async () => {
    render(<AgendaView today={new Date(2026, 5, 23)} />);
    await userEvent.click(screen.getByRole('button', { name: /novo agendamento/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('returns to the current month with Hoje', async () => {
    render(<AgendaView today={new Date(2026, 5, 23)} />);
    await userEvent.click(screen.getByRole('button', { name: /próximo mês/i }));
    expect(screen.getByText('Julho 2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /hoje/i }));
    expect(screen.getByText('Junho 2026')).toBeInTheDocument();
  });
});
