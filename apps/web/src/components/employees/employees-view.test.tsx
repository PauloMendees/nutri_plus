import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useEmployees = vi.fn();
vi.mock('@/lib/queries/employees', () => ({
  useEmployees: () => useEmployees(),
  useInviteEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { EmployeesView } from './employees-view';

function employee(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    userId: 'u1',
    nutritionistId: 'n1',
    user: { id: 'u1', name: 'Ana Paula', email: 'ana@x.com' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  useEmployees.mockReset();
});

describe('EmployeesView', () => {
  it('shows a loading state', () => {
    useEmployees.mockReturnValue({ isLoading: true });
    render(<EmployeesView />);
    expect(screen.getByTestId('employees-loading')).toBeInTheDocument();
  });

  it('shows an empty state with an invite CTA', () => {
    useEmployees.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<EmployeesView />);
    expect(screen.getByText(/nenhum funcionário ainda/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /convidar funcionário/i })).toBeInTheDocument();
  });

  it('shows an error state', () => {
    useEmployees.mockReturnValue({ isLoading: false, isError: true });
    render(<EmployeesView />);
    expect(screen.getByText(/erro ao carregar/i)).toBeInTheDocument();
  });

  it('renders rows and filters by name', async () => {
    useEmployees.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        employee(),
        employee({ id: 'e2', user: { id: 'u2', name: 'Bruno Lima', email: 'bruno@x.com' } }),
      ],
    });
    render(<EmployeesView />);
    expect(screen.getAllByText('Ana Paula').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bruno Lima').length).toBeGreaterThan(0);

    await userEvent.type(screen.getByLabelText(/buscar por nome/i), 'bruno');
    expect(screen.queryByText('Ana Paula')).not.toBeInTheDocument();
    expect(screen.getAllByText('Bruno Lima').length).toBeGreaterThan(0);
  });

  it('shows a no-match message when the search finds nothing', async () => {
    useEmployees.mockReturnValue({ isLoading: false, isError: false, data: [employee()] });
    render(<EmployeesView />);
    await userEvent.type(screen.getByLabelText(/buscar por nome/i), 'zzz');
    expect(screen.getByText(/nenhum funcionário encontrado/i)).toBeInTheDocument();
  });

  it('opens the create dialog from the header button', async () => {
    useEmployees.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<EmployeesView />);
    await userEvent.click(screen.getByRole('button', { name: /novo funcionário/i }));
    expect(await screen.findByText(/o funcionário receberá um convite/i)).toBeInTheDocument();
  });

  it('opens the edit dialog when a row is clicked', async () => {
    useEmployees.mockReturnValue({ isLoading: false, isError: false, data: [employee()] });
    render(<EmployeesView />);
    await userEvent.click(screen.getAllByRole('button', { name: /ana paula/i })[0]);
    expect(await screen.findByText(/identidade de acesso/i)).toBeInTheDocument();
  });

  it('opens the edit dialog via keyboard on a desktop row', async () => {
    useEmployees.mockReturnValue({ isLoading: false, isError: false, data: [employee()] });
    render(<EmployeesView />);
    const targets = screen.getAllByRole('button', { name: /ana paula/i });
    const row = targets[targets.length - 1]; // the <tr role="button">
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText(/identidade de acesso/i)).toBeInTheDocument();
  });
});
