import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Appointment } from '@nutri-plus/shared-types';
import { AppointmentTooltip } from './appointment-tooltip';

function makeAppt(overrides: Partial<Appointment> = {}): Appointment {
  const start = new Date(2026, 5, 23, 8, 30);
  const end = new Date(2026, 5, 23, 9, 15);
  return {
    id: 'a1',
    nutritionistId: 'n1',
    patientId: null,
    title: 'Consulta de retorno',
    description: null,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    createdAt: '',
    updatedAt: '',
    patient: null,
    ...overrides,
  };
}

describe('AppointmentTooltip', () => {
  it('shows the full appointment details on hover', async () => {
    const appt = makeAppt({
      patient: { id: 'p1', user: { id: 'u1', name: 'Maria Silva', email: 'maria@x.com' } },
      description: 'Levar exames recentes',
    });
    render(
      <AppointmentTooltip appointment={appt}>
        <button type="button">chip</button>
      </AppointmentTooltip>,
    );
    await userEvent.hover(screen.getByRole('button', { name: 'chip' }));
    // Radix renders the content twice (visible tooltip + a visually-hidden copy
    // for screen-reader announcement), so assert on at-least-one match.
    expect((await screen.findAllByText('Consulta de retorno')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/08:30–09:15/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Maria Silva').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Levar exames recentes').length).toBeGreaterThan(0);
  });

  it('omits patient and description when absent', async () => {
    render(
      <AppointmentTooltip appointment={makeAppt()}>
        <button type="button">chip</button>
      </AppointmentTooltip>,
    );
    await userEvent.hover(screen.getByRole('button', { name: 'chip' }));
    expect((await screen.findAllByText('Consulta de retorno')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Maria Silva')).toBeNull();
    expect(screen.queryByText('Levar exames recentes')).toBeNull();
  });
});
