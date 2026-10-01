import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useAdminNutritionist = vi.fn();
vi.mock('@/lib/queries/admin', () => ({ useAdminNutritionist: (id: string) => useAdminNutritionist(id) }));

import { AdminNutritionistDetail } from './nutritionist-detail';

describe('AdminNutritionistDetail', () => {
  it('shows the nutritionist header and her patients', () => {
    useAdminNutritionist.mockReturnValue({
      isLoading: false, isError: false,
      data: {
        nutritionist: { id: 'n1', name: 'Ana Souza', email: 'ana@x.com', phone: null, confirmed: true, patientCount: 1, plan: 'COMP', createdAt: '2026-09-01T12:00:00.000Z' },
        patients: [{ id: 'p1', name: 'Maria', email: null, phone: null, nutritionistName: 'Ana Souza', inviteStatus: 'NOT_INVITED', createdAt: '2026-09-15T12:00:00.000Z' }],
      },
    });
    render(<AdminNutritionistDetail id="n1" />);
    expect(useAdminNutritionist).toHaveBeenCalledWith('n1');
    expect(screen.getByRole('heading', { name: 'Ana Souza' })).toBeInTheDocument();
    expect(screen.getByText('Cortesia')).toBeInTheDocument();
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voltar para o painel/i })).toHaveAttribute('href', '/admin');
  });

  it('shows an empty state without patients', () => {
    useAdminNutritionist.mockReturnValue({
      isLoading: false, isError: false,
      data: {
        nutritionist: { id: 'n1', name: 'Ana', email: 'a@x.com', phone: null, confirmed: true, patientCount: 0, plan: 'NONE', createdAt: '2026-09-01T12:00:00.000Z' },
        patients: [],
      },
    });
    render(<AdminNutritionistDetail id="n1" />);
    expect(screen.getByText('Nenhum paciente cadastrado.')).toBeInTheDocument();
  });

  it('links back to the given panel URL', () => {
    useAdminNutritionist.mockReturnValue({
      isLoading: false, isError: false,
      data: {
        nutritionist: { id: 'n1', name: 'Ana', email: 'a@x.com', phone: null, confirmed: true, patientCount: 0, plan: 'NONE', createdAt: '2026-09-01T12:00:00.000Z' },
        patients: [],
      },
    });
    render(<AdminNutritionistDetail id="n1" backHref="/admin?tab=nutricionistas&plan=PRO" />);
    expect(screen.getByRole('link', { name: /voltar para o painel/i })).toHaveAttribute('href', '/admin?tab=nutricionistas&plan=PRO');
  });
});
