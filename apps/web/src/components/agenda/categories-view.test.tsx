import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const useAppointmentCategories = vi.fn();
vi.mock('@/lib/queries/appointment-categories', () => ({
  useAppointmentCategories: () => useAppointmentCategories(),
  useCreateAppointmentCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAppointmentCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAppointmentCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { CategoriesView } from './categories-view';

beforeEach(() => {
  useAppointmentCategories.mockReset();
});

describe('CategoriesView', () => {
  it('shows the empty state', () => {
    useAppointmentCategories.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<CategoriesView />);
    expect(screen.getByText(/nenhuma categoria/i)).toBeInTheDocument();
  });

  it('lists categories with a default badge', () => {
    useAppointmentCategories.mockReturnValue({
      data: [
        { id: 'c1', nutritionistId: 'n1', name: 'Consulta', color: '#14BFA6', isDefault: true, createdAt: '', updatedAt: '' },
      ],
      isLoading: false,
      isError: false,
    });
    render(<CategoriesView />);
    expect(screen.getByText('Consulta')).toBeInTheDocument();
    expect(screen.getByText(/padrão/i)).toBeInTheDocument();
  });
});
