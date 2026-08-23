import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { runFixture } from '@/lib/onboarding/fixtures';

vi.mock('@/lib/hooks/use-debounced-value', () => ({
  useDebouncedValue: (value: string) => value,
}));
vi.mock('@/lib/queries/foods', () => ({
  useFoodSearch: (term: string) => ({
    data:
      term.trim().length >= 2
        ? [
            {
              id: 'f1',
              name: 'Arroz, integral, cozido',
              group: 'Cereais e derivados',
              energyKcal: 123.5,
              protein: 2.6,
              carbohydrate: 25.8,
              lipid: 1,
              fiber: 2.7,
              sodium: 1,
            },
          ]
        : [],
    isLoading: false,
    isError: false,
    isFetching: false,
  }),
}));

import { FoodsBrowse } from './foods-browse';

describe('FoodsBrowse tour', () => {
  it('exposes the search anchor and fills the fixture', () => {
    render(<FoodsBrowse />);
    const input = screen.getByLabelText('Buscar alimento');
    expect(input).toHaveAttribute('data-tour', 'alimentos.search');
    expect(document.querySelector('[data-tour="alimentos.table"]')).toBeNull();

    act(() => runFixture('foods-search'));

    expect(input).toHaveValue('arroz');
    expect(screen.getByText('Arroz, integral, cozido')).toBeInTheDocument();
    expect(document.querySelector('[data-tour="alimentos.table"]')).not.toBeNull();
  });
});
