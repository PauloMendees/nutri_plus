import { useSyncExternalStore } from 'react';
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
// URL de mentira com estado: replace() troca a query e re-renderiza quem lê
// useSearchParams, como o App Router faz.
let currentParams = new URLSearchParams();
const listeners = new Set<() => void>();
function setUrl(qs: string) {
  currentParams = new URLSearchParams(qs);
  listeners.forEach((l) => l());
}
const push = vi.fn();
const replace = vi.fn((url: string) => setUrl(url.split('?')[1] ?? ''));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () =>
    useSyncExternalStore(
      (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      () => currentParams,
    ),
}));
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
  replace.mockClear();
  currentParams = new URLSearchParams();
});

function lastUrl() {
  return new URLSearchParams((replace.mock.calls.at(-1)?.[0] as string).split('?')[1]);
}

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

  // Filtros e página vivem na URL: voltar do detalhe (link ou navegador) os reabre.
  it('starts from the filters and page in the URL', () => {
    setUrl('tab=nutricionistas&search=ana&confirmed=no&plan=TRIAL&createdFrom=2026-09-01&createdTo=2026-09-30&page=2');
    render(<NutritionistsTab />);
    expect(lastArgs()).toEqual([
      { search: 'ana', confirmed: 'no', plan: 'TRIAL', createdFrom: '2026-09-01', createdTo: '2026-09-30' },
      2,
    ]);
    expect(screen.getByLabelText(/buscar/i)).toHaveValue('ana');
    expect(screen.getByLabelText(/confirmou/i)).toHaveValue('no');
    expect(screen.getByLabelText(/^plano$/i)).toHaveValue('TRIAL');
    expect(screen.getByLabelText(/cadastro de/i)).toHaveValue('2026-09-01');
    expect(screen.getByLabelText(/cadastro até/i)).toHaveValue('2026-09-30');
  });

  it('ignores invalid filter values in the URL', () => {
    setUrl('confirmed=talvez&plan=GRATIS&page=abc');
    render(<NutritionistsTab />);
    expect(lastArgs()).toEqual([{}, 1]);
  });

  it('writes filter changes to the URL and resets the page', async () => {
    setUrl('tab=nutricionistas&page=3');
    render(<NutritionistsTab />);
    expect(replace).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText(/^plano$/i), 'PRO');
    expect(lastUrl().get('tab')).toBe('nutricionistas');
    expect(lastUrl().get('plan')).toBe('PRO');
    expect(lastUrl().get('page')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(lastUrl().get('page')).toBe('2');

    await userEvent.type(screen.getByLabelText(/buscar/i), 'ana');
    expect(lastUrl().get('search')).toBe('ana');
    expect(lastUrl().get('plan')).toBe('PRO');
    expect(lastUrl().get('page')).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText(/^plano$/i), '');
    expect(lastUrl().get('plan')).toBeNull();
  });

  it('opens the detail of a confirmed nutritionist, not of a pending one', async () => {
    render(<NutritionistsTab />);
    await userEvent.click(screen.getByText('Ana Souza'));
    expect(push).toHaveBeenCalledWith('/admin/nutritionists/n1');
    push.mockReset();
    // Com filtros ativos, o detalhe recebe a query do painel para poder voltar a ela.
    setUrl('tab=nutricionistas&plan=PRO&page=2');
    await userEvent.click(screen.getByText('Ana Souza'));
    expect(push).toHaveBeenCalledWith(
      `/admin/nutritionists/n1?voltar=${encodeURIComponent('tab=nutricionistas&plan=PRO&page=2')}`,
    );
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
