import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useAdminNutritionists = vi.fn();
vi.mock('@/lib/queries/admin', () => ({
  useAdminNutritionists: (...a: unknown[]) => useAdminNutritionists(...a),
}));
const downloadReport = vi.fn();
vi.mock('@/lib/api/admin', () => ({ downloadAdminNutritionistsReport: (...a: unknown[]) => downloadReport(...a) }));
vi.mock('@/lib/hooks/use-debounced-value', () => ({ useDebouncedValue: (v: unknown) => v }));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { NutritionistsTab } from './nutritionists-tab';

const confirmedRow = {
  id: 'n1', name: 'Ana Souza', email: 'ana@x.com', phone: '5511999998888', confirmed: true,
  patientCount: 3, plan: 'PRO', createdAt: '2026-09-10T15:00:00.000Z',
};
const pendingRow = { ...confirmedRow, id: null, name: 'Pendente', email: 'p@x.com', confirmed: false, patientCount: 0, plan: 'NONE' };

function lastArgs() {
  return useAdminNutritionists.mock.calls.at(-1) as [Record<string, unknown>, number];
}

beforeEach(() => {
  useAdminNutritionists.mockReset().mockReturnValue({
    isLoading: false, isError: false, isFetching: false,
    data: { items: [confirmedRow, pendingRow], total: 41, page: 1, pageSize: 20, totalPages: 3 },
  });
  downloadReport.mockReset().mockResolvedValue(undefined);
  push.mockReset();
});

describe('NutritionistsTab', () => {
  it('renders the columns and rows', () => {
    render(<NutritionistsTab />);
    for (const h of ['Nome', 'E-mail', 'Telefone', 'Confirmou', 'Pacientes', 'Plano', 'Cadastro']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
    }
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Ana Souza')).toBeInTheDocument();
    expect(table.getByText('Pro')).toBeInTheDocument();
    expect(table.getByText('Sem plano')).toBeInTheDocument();
    expect(screen.getByText('41 nutricionistas')).toBeInTheDocument();
  });

  it('sends the filters to the query and goes back to page 1 on change', async () => {
    render(<NutritionistsTab />);
    await userEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(lastArgs()[1]).toBe(2);

    await userEvent.selectOptions(screen.getByLabelText(/confirmou/i), 'no');
    expect(lastArgs()).toEqual([expect.objectContaining({ confirmed: 'no' }), 1]);

    await userEvent.selectOptions(screen.getByLabelText(/^plano$/i), 'TRIAL');
    await userEvent.type(screen.getByLabelText(/buscar/i), 'ana');
    fireEvent.change(screen.getByLabelText(/cadastro de/i), { target: { value: '2026-09-01' } });
    expect(lastArgs()[0]).toEqual(
      expect.objectContaining({ confirmed: 'no', plan: 'TRIAL', search: 'ana', createdFrom: '2026-09-01' }),
    );
  });

  it('opens the detail of a confirmed nutritionist, not of a pending one', async () => {
    render(<NutritionistsTab />);
    await userEvent.click(screen.getByText('Ana Souza'));
    expect(push).toHaveBeenCalledWith('/admin/nutritionists/n1');
    push.mockReset();
    await userEvent.click(screen.getByText('Pendente'));
    expect(push).not.toHaveBeenCalled();
  });

  it('downloads the PDF with the active filters', async () => {
    render(<NutritionistsTab />);
    await userEvent.selectOptions(screen.getByLabelText(/^plano$/i), 'PRO');
    await userEvent.click(screen.getByRole('button', { name: /baixar relatório/i }));
    await waitFor(() => expect(downloadReport).toHaveBeenCalledWith(expect.objectContaining({ plan: 'PRO' })));
  });
});
