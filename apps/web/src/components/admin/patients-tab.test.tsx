import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useAdminPatients = vi.fn();
vi.mock('@/lib/queries/admin', () => ({ useAdminPatients: (...a: unknown[]) => useAdminPatients(...a) }));
vi.mock('@/lib/hooks/use-debounced-value', () => ({ useDebouncedValue: (v: unknown) => v }));

import { PatientsTab } from './patients-tab';

beforeEach(() => {
  useAdminPatients.mockReset().mockReturnValue({
    isLoading: false, isError: false,
    data: {
      items: [{ id: 'p1', name: 'Maria', email: 'm@x.com', phone: '5511', nutritionistName: 'Dra. Ana', inviteStatus: 'ACTIVE', createdAt: '2026-09-15T12:00:00.000Z' }],
      total: 25, page: 1, pageSize: 20, totalPages: 2,
    },
  });
});

describe('PatientsTab', () => {
  it('renders the patients with their nutritionist and app status', () => {
    render(<PatientsTab />);
    for (const h of ['Paciente', 'E-mail', 'Telefone', 'Nutricionista', 'Status do app', 'Cadastro']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
    }
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
    expect(screen.getByText('25 pacientes')).toBeInTheDocument();
  });

  it('searches from page 1 and paginates', async () => {
    render(<PatientsTab />);
    await userEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(useAdminPatients.mock.calls.at(-1)).toEqual(['', 2]);
    await userEvent.type(screen.getByLabelText(/buscar/i), 'mar');
    expect(useAdminPatients.mock.calls.at(-1)).toEqual(['mar', 1]);
  });

  // Busca sem resultado não é o mesmo que base vazia.
  it('says nothing was found when a search has no rows', async () => {
    useAdminPatients.mockReturnValue({
      isLoading: false, isError: false,
      data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 },
    });
    render(<PatientsTab />);
    expect(screen.getByText('Nenhum paciente cadastrado.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/buscar/i), 'zzz');
    expect(screen.getByText('Nenhum paciente encontrado.')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum paciente cadastrado.')).not.toBeInTheDocument();
  });
});
