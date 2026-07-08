import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const usePatients = vi.fn();
vi.mock('@/lib/queries/patients', () => ({ usePatients: (...a: unknown[]) => usePatients(...a) }));
// Debounce is identity in these tests; the hook has its own timer test.
vi.mock('@/lib/hooks/use-debounced-value', () => ({ useDebouncedValue: (v: unknown) => v }));

import { PatientsList } from './patients-list';

const patient = {
  id: 'p1',
  user: { id: 'u1', name: 'Maria Silva', email: 'maria@x.com' },
  objective: 'WEIGHT_LOSS',
  activityLevel: 'MODERATE',
  createdAt: '2026-05-12T00:00:00.000Z',
};

function envelope(overrides: Record<string, unknown> = {}) {
  return { items: [patient], total: 1, page: 1, pageSize: 20, totalPages: 1, ...overrides };
}

beforeEach(() => usePatients.mockReset());

describe('PatientsList', () => {
  it('shows a loading state', () => {
    usePatients.mockReturnValue({ isLoading: true });
    render(<PatientsList />);
    expect(screen.getByTestId('patients-loading')).toBeInTheDocument();
  });

  it('shows an empty state with a create CTA when there are no patients and no search', () => {
    usePatients.mockReturnValue({ isLoading: false, isError: false, isFetching: false, data: envelope({ items: [], total: 0, totalPages: 0 }) });
    render(<PatientsList />);
    expect(screen.getByText(/nenhum paciente ainda/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /novo paciente/i })).toHaveAttribute('href', '/patients/new');
  });

  it('shows an error state', () => {
    usePatients.mockReturnValue({ isLoading: false, isError: true });
    render(<PatientsList />);
    expect(screen.getByText(/erro ao carregar/i)).toBeInTheDocument();
  });

  it('renders a row linking to the patient with a pt-BR objective, and the total count', () => {
    usePatients.mockReturnValue({ isLoading: false, isError: false, isFetching: false, data: envelope({ total: 42 }) });
    render(<PatientsList />);
    expect(screen.getAllByText('Maria Silva')).toHaveLength(2);
    expect(screen.getAllByText('Perda de peso')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /maria silva/i })[0]).toHaveAttribute('href', '/patients/p1');
    expect(screen.getByText(/42 pacientes/i)).toBeInTheDocument();
  });

  it('queries with the typed search term and resets to page 1', async () => {
    usePatients.mockImplementation((params) => ({
      isLoading: false, isError: false, isFetching: false,
      data: envelope({ page: params?.page ?? 1, total: 50, totalPages: 3 }),
    }));
    render(<PatientsList />);
    await userEvent.click(screen.getByRole('button', { name: /próxima/i })); // page 2
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Buscar paciente'), 'ana');
    expect(usePatients).toHaveBeenLastCalledWith({ search: 'ana', page: 1, pageSize: 20 });
  });

  it('paginates with Anterior/Próxima and disables them at the bounds', async () => {
    usePatients.mockImplementation((params) => ({
      isLoading: false, isError: false, isFetching: false,
      data: envelope({ page: params?.page ?? 1, total: 50, totalPages: 3 }),
    }));
    render(<PatientsList />);
    const prev = screen.getByRole('button', { name: /anterior/i });
    const next = screen.getByRole('button', { name: /próxima/i });
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();
    await userEvent.click(next);
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
    expect(prev).toBeEnabled();
    await userEvent.click(next);
    expect(screen.getByText('Página 3 de 3')).toBeInTheDocument();
    expect(next).toBeDisabled();
    expect(usePatients).toHaveBeenLastCalledWith({ search: '', page: 3, pageSize: 20 });
  });

  it('hides the pager when there is a single page', () => {
    usePatients.mockReturnValue({ isLoading: false, isError: false, isFetching: false, data: envelope({ total: 3, totalPages: 1 }) });
    render(<PatientsList />);
    expect(screen.queryByText(/página/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /próxima/i })).not.toBeInTheDocument();
  });

  it('shows a no-match message for a search with no results', async () => {
    usePatients.mockImplementation((params) => ({
      isLoading: false, isError: false, isFetching: false,
      data: params?.search
        ? { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }
        : envelope(),
    }));
    render(<PatientsList />);
    await userEvent.type(screen.getByLabelText('Buscar paciente'), 'zzz');
    expect(screen.getByText(/nenhum paciente encontrado/i)).toBeInTheDocument();
  });

  it('hides the create button when canCreate is false', () => {
    usePatients.mockReturnValue({ isLoading: false, isError: false, isFetching: false, data: envelope() });
    render(<PatientsList canCreate={false} />);
    expect(screen.queryByRole('link', { name: /novo paciente/i })).not.toBeInTheDocument();
  });

  it('hides the empty-state CTA when canCreate is false', () => {
    usePatients.mockReturnValue({ isLoading: false, isError: false, isFetching: false, data: envelope({ items: [], total: 0, totalPages: 0 }) });
    render(<PatientsList canCreate={false} />);
    expect(screen.getByText(/nenhum paciente ainda/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /cadastrar primeiro paciente/i })).not.toBeInTheDocument();
  });
});
