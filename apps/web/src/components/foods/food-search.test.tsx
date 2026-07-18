import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Food } from '@nutri-plus/shared-types';

const useFoodSearch = vi.fn();
vi.mock('@/lib/queries/foods', () => ({ useFoodSearch: (...a: unknown[]) => useFoodSearch(...a) }));
// Debounce is identity in these tests; the hook has its own timer test.
vi.mock('@/lib/hooks/use-debounced-value', () => ({ useDebouncedValue: (v: unknown) => v }));

import { FoodSearch } from './food-search';

const food: Food = {
  id: 'f1',
  tacoId: 123,
  name: 'Arroz, integral, cozido',
  group: 'Cereais e derivados',
  energyKcal: 124,
  protein: 2.6,
  carbohydrate: 25.8,
  lipid: 1,
  fiber: 2.7,
  sodium: 1,
};

beforeEach(() => {
  useFoodSearch.mockReset();
  useFoodSearch.mockImplementation((term: string) => ({
    data: term.trim().length >= 2 ? [food] : undefined,
    isLoading: false,
    isFetching: false,
  }));
});

describe('FoodSearch', () => {
  it('shows no results for a term under 2 characters', async () => {
    render(<FoodSearch />);
    await userEvent.type(screen.getByRole('textbox'), 'a');
    expect(screen.queryByText(/arroz/i)).not.toBeInTheDocument();
  });

  it('shows a matching food with its kcal once the term reaches 2 characters', async () => {
    render(<FoodSearch />);
    await userEvent.type(screen.getByRole('textbox'), 'arroz');
    expect(screen.getByText(/arroz, integral, cozido/i)).toBeInTheDocument();
    expect(screen.getByText(/124 kcal/i)).toBeInTheDocument();
  });

  it('calls onSelect with the food when a result row is clicked', async () => {
    const onSelect = vi.fn();
    render(<FoodSearch onSelect={onSelect} />);
    await userEvent.type(screen.getByRole('textbox'), 'arroz');
    await userEvent.click(screen.getByRole('button', { name: /arroz, integral, cozido/i }));
    expect(onSelect).toHaveBeenCalledWith(food);
  });
});
