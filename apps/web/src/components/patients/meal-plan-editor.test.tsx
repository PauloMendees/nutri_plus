import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useMealPlan = vi.fn();
const createMut = vi.fn();
const updateMut = vi.fn();
const deleteMut = vi.fn();
const push = vi.fn();
const replace = vi.fn();

vi.mock('@/lib/queries/meal-plans', () => ({
  useMealPlan: () => useMealPlan(),
  useCreateMealPlan: () => ({ mutateAsync: createMut, isPending: false }),
  useUpdateMealPlan: () => ({ mutateAsync: updateMut, isPending: false }),
  useDeleteMealPlan: () => ({ mutateAsync: deleteMut, isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MealPlanEditor } from './meal-plan-editor';

const plan = {
  id: 'm1', patientId: 'p1', title: 'Plano A', objective: 'Hipertrofia', aiGenerated: false,
  targetCalories: 1800, targetProtein: 135, targetCarbs: 180, targetFats: 60,
  createdAt: '', updatedAt: '',
  meals: [
    { id: 'me1', mealPlanId: 'm1', name: 'Café', timeLabel: '08:00', instructions: '', order: 0,
      items: [{ id: 'it1', mealId: 'me1', foodName: 'Ovos', quantity: '3 unid', calories: 230, protein: 18, carbs: 2, fats: 16, order: 0 }] },
    { id: 'me2', mealPlanId: 'm1', name: 'Almoço', timeLabel: '12:30', instructions: '', order: 1, items: [] },
  ],
};

beforeEach(() => {
  useMealPlan.mockReset().mockReturnValue({ data: plan, isLoading: false, isError: false });
  createMut.mockReset().mockResolvedValue({ id: 'new1' });
  updateMut.mockReset().mockResolvedValue(plan);
  deleteMut.mockReset().mockResolvedValue(undefined);
  push.mockReset();
  replace.mockReset();
});

describe('MealPlanEditor (edit mode)', () => {
  it('renders the loaded tree and the summed totals', () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    expect(screen.getByDisplayValue('Plano A')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Café')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ovos')).toBeInTheDocument();
    // Totals bar shows the single item's calories total (230) vs target (1800).
    expect(screen.getByTestId('total-calories')).toHaveTextContent('230');
  });

  it('recomputes totals when an item macro changes', async () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    const cal = screen.getByDisplayValue('230');
    await userEvent.clear(cal);
    await userEvent.type(cal, '300');
    expect(screen.getByTestId('total-calories')).toHaveTextContent('300');
  });

  it('saves the whole tree via updateMealPlan', async () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1));
    const arg = updateMut.mock.calls[0][0];
    expect(arg.id).toBe('m1');
    expect(arg.body.meals).toHaveLength(2);
    expect(arg.body.meals[0].items[0].foodName).toBe('Ovos');
  });

  it('adds and removes a meal', async () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    expect(screen.getAllByTestId('meal-card')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: /adicionar refeição/i }));
    expect(screen.getAllByTestId('meal-card')).toHaveLength(3);
    const first = screen.getAllByTestId('meal-card')[0];
    await userEvent.click(within(first).getByRole('button', { name: /remover refeição/i }));
    expect(screen.getAllByTestId('meal-card')).toHaveLength(2);
  });

  it('deletes with an inline confirm', async () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /excluir/i }));
    expect(screen.getByText(/não pode ser desfeita/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^excluir$/i }));
    await waitFor(() => expect(deleteMut).toHaveBeenCalledWith('m1'));
    expect(push).toHaveBeenCalledWith('/patients/p1');
  });

  it('reorders items within a meal', async () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    const firstMeal = screen.getAllByTestId('meal-card')[0];
    await userEvent.click(within(firstMeal).getByRole('button', { name: /adicionar item/i }));
    const foods = () => within(firstMeal).getAllByLabelText('Alimento') as HTMLInputElement[];
    expect(foods()[0]).toHaveValue('Ovos');
    await userEvent.click(within(firstMeal).getAllByRole('button', { name: /mover item para baixo/i })[0]);
    expect(foods()[1]).toHaveValue('Ovos');
  });

  it('is read-only for employees: no Salvar, fields disabled', () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit={false} />);
    expect(screen.queryByRole('button', { name: /^salvar$/i })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Plano A')).toBeDisabled();
  });
});

describe('MealPlanEditor (create mode)', () => {
  it('starts blank and creates via createMealPlan, then navigates', async () => {
    render(<MealPlanEditor patientId="p1" canEdit />);
    await userEvent.type(screen.getByLabelText(/título/i), 'Novo plano');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(createMut).toHaveBeenCalledTimes(1));
    expect(createMut.mock.calls[0][0].patientId).toBe('p1');
    expect(createMut.mock.calls[0][0].title).toBe('Novo plano');
    expect(replace).toHaveBeenCalledWith('/patients/p1/planos/new1');
  });
});
