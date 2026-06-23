import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const usePatients = vi.fn();
vi.mock('@/lib/queries/patients', () => ({ usePatients: () => usePatients() }));

import { PatientsList } from './patients-list';

const patient = {
  id: 'p1',
  user: { id: 'u1', name: 'Maria Silva', email: 'maria@x.com' },
  objective: 'WEIGHT_LOSS',
  activityLevel: 'MODERATE',
  createdAt: '2026-05-12T00:00:00.000Z',
};

describe('PatientsList', () => {
  it('shows a loading state', () => {
    usePatients.mockReturnValue({ isLoading: true });
    render(<PatientsList />);
    expect(screen.getByTestId('patients-loading')).toBeInTheDocument();
  });
  it('shows an empty state with a create CTA', () => {
    usePatients.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<PatientsList />);
    expect(screen.getByText(/nenhum paciente/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /novo paciente/i })).toHaveAttribute('href', '/patients/new');
  });
  it('shows an error state', () => {
    usePatients.mockReturnValue({ isLoading: false, isError: true });
    render(<PatientsList />);
    expect(screen.getByText(/erro ao carregar/i)).toBeInTheDocument();
  });
  it('renders a row linking to the patient with a pt-BR objective', () => {
    usePatients.mockReturnValue({ isLoading: false, isError: false, data: [patient] });
    render(<PatientsList />);
    expect(screen.getAllByText('Maria Silva')).toHaveLength(2);
    expect(screen.getAllByText('Perda de peso')).toHaveLength(2);
    const links = screen.getAllByRole('link', { name: /maria silva/i });
    expect(links[0]).toHaveAttribute('href', '/patients/p1');
  });
});
