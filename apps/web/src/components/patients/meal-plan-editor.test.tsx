import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useMealPlan = vi.fn();
const createMut = vi.fn();
const updateMut = vi.fn();
const deleteMut = vi.fn();
const push = vi.fn();
const replace = vi.fn();
const downloadMealPlanPdf = vi.fn();

vi.mock('@/lib/queries/meal-plans', () => ({
  useMealPlan: () => useMealPlan(),
  useCreateMealPlan: () => ({ mutateAsync: createMut, isPending: false }),
  useUpdateMealPlan: () => ({ mutateAsync: updateMut, isPending: false }),
  useDeleteMealPlan: () => ({ mutateAsync: deleteMut, isPending: false }),
  useAdjustMealPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api/meal-plans', () => ({
  downloadMealPlanPdf: (...args: unknown[]) => downloadMealPlanPdf(...args),
}));

import { MealPlanEditor } from './meal-plan-editor';

const plan = {
  id: 'm1', patientId: 'p1', title: 'Plano A', objective: 'Hipertrofia', aiGenerated: false,
  targetCalories: 1800, targetProtein: 135, targetCarbs: 180, targetFats: 60,
  createdAt: '', updatedAt: '',
  meals: [
    { id: 'me1', mealPlanId: 'm1', name: 'Café', timeLabel: '08:00', instructions: '', order: 0,
      options: [
        { id: 'op1', mealId: 'me1', label: 'Opção 1', order: 0,
          items: [{ id: 'it1', mealOptionId: 'op1', foodName: 'Ovos', quantity: '3 unid', calories: 230, protein: 18, carbs: 2, fats: 16, order: 0 }] },
      ] },
    { id: 'me2', mealPlanId: 'm1', name: 'Almoço', timeLabel: '12:30', instructions: '', order: 1,
      options: [{ id: 'op2', mealId: 'me2', label: 'Opção 1', order: 0, items: [] }] },
  ],
};

beforeEach(() => {
  useMealPlan.mockReset().mockReturnValue({ data: plan, isLoading: false, isError: false });
  createMut.mockReset().mockResolvedValue({ id: 'new1' });
  updateMut.mockReset().mockResolvedValue(plan);
  deleteMut.mockReset().mockResolvedValue(undefined);
  push.mockReset();
  replace.mockReset();
  downloadMealPlanPdf.mockReset().mockResolvedValue(undefined);
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

  it('has a back link to the patient', () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    expect(screen.getByRole('link', { name: /voltar ao paciente/i })).toHaveAttribute(
      'href',
      '/patients/p1',
    );
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
    expect(arg.body.meals[0].options[0].items[0].foodName).toBe('Ovos');
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

  it('adds and removes an option within a meal', async () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    const firstMeal = screen.getAllByTestId('meal-card')[0];
    expect(within(firstMeal).getAllByTestId('option-card')).toHaveLength(1);
    await userEvent.click(within(firstMeal).getByRole('button', { name: /adicionar opção/i }));
    expect(within(firstMeal).getAllByTestId('option-card')).toHaveLength(2);
    await userEvent.click(within(firstMeal).getAllByRole('button', { name: /remover opção/i })[1]);
    expect(within(firstMeal).getAllByTestId('option-card')).toHaveLength(1);
  });

  it('shows a per-option subtotal', () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    const firstOption = screen.getAllByTestId('option-card')[0];
    expect(within(firstOption).getByTestId('option-subtotal-calories')).toHaveTextContent('230');
  });

  it('day total sums only the first option of each meal', async () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    const firstMeal = screen.getAllByTestId('meal-card')[0];
    // Add a second option with a heavier item; the day total must NOT include it.
    await userEvent.click(within(firstMeal).getByRole('button', { name: /adicionar opção/i }));
    const secondOption = within(firstMeal).getAllByTestId('option-card')[1];
    await userEvent.type(within(secondOption).getByLabelText('Kcal'), '999');
    expect(screen.getByTestId('total-calories')).toHaveTextContent('230');
  });

  it('is read-only for employees: no Salvar, fields disabled', () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit={false} />);
    expect(screen.queryByRole('button', { name: /^salvar$/i })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Plano A')).toBeDisabled();
  });

  it('shows "Exportar PDF" for an existing plan (nutritionist)', () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    expect(screen.getByRole('button', { name: /exportar pdf/i })).toBeInTheDocument();
  });

  it('shows "Exportar PDF" for an existing plan (employee, read-only)', () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit={false} />);
    expect(screen.getByRole('button', { name: /exportar pdf/i })).toBeInTheDocument();
  });

  it('exports the PDF when clicked', async () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /exportar pdf/i }));
    await waitFor(() => expect(downloadMealPlanPdf).toHaveBeenCalledWith('m1'));
  });

  it('renders text fields as auto-grow textareas so long values are not truncated', () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    // Food name, plan title, meal name are now <textarea> (grow) not <input> (truncate).
    expect(screen.getByDisplayValue('Ovos').tagName).toBe('TEXTAREA');
    expect(screen.getByDisplayValue('Plano A').tagName).toBe('TEXTAREA');
    expect(screen.getByDisplayValue('Café').tagName).toBe('TEXTAREA');
    // Numeric macro fields stay <input type=number>.
    expect(screen.getAllByLabelText('Kcal')[0].tagName).toBe('INPUT');
  });

  it('offers "Solicitar ajustes à IA" in edit mode but not while creating', () => {
    const { unmount } = render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    expect(screen.getByRole('button', { name: /solicitar ajustes à ia/i })).toBeInTheDocument();
    unmount();
    useMealPlan.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    render(<MealPlanEditor patientId="p1" canEdit />);
    expect(screen.queryByRole('button', { name: /solicitar ajustes à ia/i })).toBeNull();
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

  it('hides "Exportar PDF" while creating a new plan', () => {
    render(<MealPlanEditor patientId="p1" canEdit />);
    expect(screen.queryByRole('button', { name: /exportar pdf/i })).not.toBeInTheDocument();
  });
});
