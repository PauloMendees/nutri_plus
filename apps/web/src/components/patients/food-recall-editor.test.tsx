import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useFoodRecall = vi.fn();
const createMut = vi.fn();
const updateMut = vi.fn();
const deleteMut = vi.fn();
const push = vi.fn();
const replace = vi.fn();

vi.mock('@/lib/queries/food-recalls', () => ({
  useFoodRecall: () => useFoodRecall(),
  useCreateFoodRecall: () => ({ mutateAsync: createMut, isPending: false }),
  useUpdateFoodRecall: () => ({ mutateAsync: updateMut, isPending: false }),
  useDeleteFoodRecall: () => ({ mutateAsync: deleteMut, isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const notifyChapterActionSucceeded = vi.fn(() => Promise.resolve(false));
vi.mock('@/components/onboarding/tour-provider', () => ({
  useTour: () => ({
    start: vi.fn(),
    exit: vi.fn(),
    skipChapter: vi.fn(),
    isPlayDemoSubmit: () => false,
    notifyChapterActionSucceeded,
  }),
}));
vi.mock('@/lib/queries/nutrition-targets', () => ({
  useNutritionTargets: () => ({ data: [{ targetCalories: 2000, proteinGrams: 150, carbGrams: 200, fatGrams: 55 }] }),
}));
vi.mock('@/lib/queries/foods', () => ({
  useFoodSearch: () => ({
    data: [{ id: 'f1', name: 'Arroz integral cozido', group: 'Cereais', energyKcal: 124, protein: 2.6, carbohydrate: 25.8, lipid: 1, fiber: 2.7, sodium: 1.2 }],
    isLoading: false,
    isFetching: false,
  }),
}));

import { FoodRecallEditor } from './food-recall-editor';

const recall = {
  id: 'r1', patientId: 'p1', recallDate: '2026-07-20T00:00:00.000Z', notes: 'Nota teste',
  createdAt: '', updatedAt: '',
  meals: [
    { id: 'me1', foodRecallId: 'r1', name: 'Café', timeLabel: '08:00', order: 0,
      items: [{ id: 'it1', recallMealId: 'me1', foodName: 'Ovos', quantity: '3 unid', calories: 230, protein: 18, carbs: 2, fats: 16, foodId: null, grams: null, fiber: 3, sodium: 5, order: 0 }] },
    { id: 'me2', foodRecallId: 'r1', name: 'Almoço', timeLabel: '12:30', order: 1,
      items: [{ id: 'it2', recallMealId: 'me2', foodName: 'Arroz branco', quantity: '100 g', calories: 130, protein: 3, carbs: 28, fats: 1, foodId: null, grams: 100, fiber: 2, sodium: 1, order: 0 }] },
  ],
};

beforeEach(() => {
  useFoodRecall.mockReset().mockReturnValue({ data: recall, isLoading: false, isError: false });
  createMut.mockReset().mockResolvedValue({ id: 'new1' });
  updateMut.mockReset().mockResolvedValue(recall);
  deleteMut.mockReset().mockResolvedValue(undefined);
  push.mockReset();
  replace.mockReset();
  notifyChapterActionSucceeded.mockReset().mockResolvedValue(false);
});

describe('FoodRecallEditor (edit mode)', () => {
  it('renders the loaded tree', () => {
    render(<FoodRecallEditor patientId="p1" recallId="r1" canEdit />);
    expect(screen.getByDisplayValue('Café')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ovos')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Arroz branco')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Nota teste')).toBeInTheDocument();
  });

  it('formata o horário da refeição automaticamente (1200 -> 12:00)', () => {
    render(<FoodRecallEditor patientId="p1" recallId="r1" canEdit />);
    const time = screen.getAllByLabelText('Horário')[0];
    // Sob 2 dígitos: sem dois-pontos ainda.
    fireEvent.change(time, { target: { value: '12' } });
    expect(time).toHaveValue('12');
    // 4 dígitos digitados de uma vez -> HH:MM.
    fireEvent.change(time, { target: { value: '1200' } });
    expect(time).toHaveValue('12:00');
    // Não-dígitos (inclusive dois-pontos já digitado) são descartados e o horário é reconstruído.
    fireEvent.change(time, { target: { value: '08:00' } });
    expect(time).toHaveValue('08:00');
  });

  it('has a back link to the patient', () => {
    render(<FoodRecallEditor patientId="p1" recallId="r1" canEdit />);
    expect(screen.getByRole('link', { name: /voltar ao paciente/i })).toHaveAttribute(
      'href',
      '/patients/p1',
    );
  });

  it('day total sums ALL items across ALL meals, shown vs the latest Meta', () => {
    render(<FoodRecallEditor patientId="p1" recallId="r1" canEdit />);
    // 230 (Café/Ovos) + 130 (Almoço/Arroz) = 360, vs the mocked target of 2000.
    expect(screen.getByTestId('total-calories')).toHaveTextContent('360');
    expect(screen.getByTestId('total-calories')).toHaveTextContent('/2000');
  });

  it('recomputes the day total when an item macro changes', async () => {
    render(<FoodRecallEditor patientId="p1" recallId="r1" canEdit />);
    const cal = screen.getByDisplayValue('230');
    await userEvent.clear(cal);
    await userEvent.type(cal, '300');
    expect(screen.getByTestId('total-calories')).toHaveTextContent('430');
  });

  it('shows fiber/sodium day totals without a Meta suffix', () => {
    render(<FoodRecallEditor patientId="p1" recallId="r1" canEdit />);
    // fiber: 3 + 2 = 5, sodium: 5 + 1 = 6 — no NutritionTarget field for these.
    expect(screen.getByTestId('total-fiber')).toHaveTextContent('5');
    expect(screen.getByTestId('total-fiber')).not.toHaveTextContent('/');
    expect(screen.getByTestId('total-sodium')).toHaveTextContent('6');
    expect(screen.getByTestId('total-sodium')).not.toHaveTextContent('/');
  });

  it('shows a per-meal subtotal', () => {
    render(<FoodRecallEditor patientId="p1" recallId="r1" canEdit />);
    const firstMeal = screen.getAllByTestId('recall-meal-card')[0];
    expect(within(firstMeal).getByTestId('meal-subtotal-calories')).toHaveTextContent('Kcal 230');
  });

  it('saves the whole tree via updateFoodRecall', async () => {
    render(<FoodRecallEditor patientId="p1" recallId="r1" canEdit />);
    expect(screen.getByRole('button', { name: /^salvar$/i })).toHaveAttribute(
      'data-tour',
      'patients.recall.save',
    );
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1));
    const arg = updateMut.mock.calls[0][0];
    expect(arg.id).toBe('r1');
    expect(arg.body.meals).toHaveLength(2);
    expect(arg.body.meals[0].items[0].foodName).toBe('Ovos');
  });

  it('adds and removes a meal', async () => {
    render(<FoodRecallEditor patientId="p1" recallId="r1" canEdit />);
    expect(screen.getAllByTestId('recall-meal-card')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: /adicionar refeição/i }));
    expect(screen.getAllByTestId('recall-meal-card')).toHaveLength(3);
    const first = screen.getAllByTestId('recall-meal-card')[0];
    await userEvent.click(within(first).getByRole('button', { name: /remover refeição/i }));
    expect(screen.getAllByTestId('recall-meal-card')).toHaveLength(2);
  });

  it('adds and removes an item within a meal', async () => {
    render(<FoodRecallEditor patientId="p1" recallId="r1" canEdit />);
    const firstMeal = screen.getAllByTestId('recall-meal-card')[0];
    await userEvent.click(within(firstMeal).getByRole('button', { name: /adicionar item/i }));
    expect(within(firstMeal).getAllByLabelText('Alimento')).toHaveLength(2);
    await userEvent.click(within(firstMeal).getAllByRole('button', { name: /remover item/i })[1]);
    expect(within(firstMeal).getAllByLabelText('Alimento')).toHaveLength(1);
  });

  it('deletes and navigates to the patient', async () => {
    render(<FoodRecallEditor patientId="p1" recallId="r1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /excluir/i }));
    await waitFor(() => expect(deleteMut).toHaveBeenCalledWith('r1'));
    expect(push).toHaveBeenCalledWith('/patients/p1');
  });

  it('is read-only for employees: no Salvar, fields disabled', () => {
    render(<FoodRecallEditor patientId="p1" recallId="r1" canEdit={false} />);
    expect(screen.queryByRole('button', { name: /^salvar$/i })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Café')).toBeDisabled();
  });

  it('picks a food via the picker dialog, then recomputes macros as grams change', async () => {
    render(<FoodRecallEditor patientId="p1" recallId="r1" canEdit />);
    const firstMeal = screen.getAllByTestId('recall-meal-card')[0];

    await userEvent.click(within(firstMeal).getByRole('button', { name: /buscar alimento/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /buscar alimento/i }), 'arroz');
    await userEvent.click(await screen.findByRole('button', { name: /arroz integral cozido/i }));

    const grams = within(firstMeal).getAllByLabelText('Gramas')[0];
    await userEvent.clear(grams);
    await userEvent.type(grams, '150');

    expect(within(firstMeal).getAllByLabelText('Kcal')[0]).toHaveValue(186);
    expect(within(firstMeal).getAllByLabelText('P')[0]).toHaveValue(4);
    expect(within(firstMeal).getAllByLabelText('C')[0]).toHaveValue(39);
    expect(within(firstMeal).getAllByLabelText('G')[0]).toHaveValue(2);
    expect(within(firstMeal).getAllByLabelText('Fib')[0]).toHaveValue(4);
    expect(within(firstMeal).getAllByLabelText('Na')[0]).toHaveValue(2);
    expect(within(firstMeal).getByDisplayValue('Arroz integral cozido')).toBeInTheDocument();
  });

  it('changing grams on a free-text item (no cached Food) leaves its macros unchanged', async () => {
    render(<FoodRecallEditor patientId="p1" recallId="r1" canEdit />);
    const firstMeal = screen.getAllByTestId('recall-meal-card')[0];
    // "Ovos" has foodId: null — typed in freely, never picked from the dialog, so there's
    // no cached Food to recompute macros from when grams change.
    const protein = within(firstMeal).getAllByLabelText('P')[0];
    await userEvent.clear(protein);
    await userEvent.type(protein, '99');

    const grams = within(firstMeal).getAllByLabelText('Gramas')[0];
    await userEvent.type(grams, '50');

    expect(grams).toHaveValue(50);
    expect(protein).toHaveValue(99);
    expect(within(firstMeal).getAllByLabelText('Kcal')[0]).toHaveValue(230);
    expect(within(firstMeal).getAllByLabelText('C')[0]).toHaveValue(2);
    expect(within(firstMeal).getAllByLabelText('G')[0]).toHaveValue(16);
    expect(within(firstMeal).getAllByLabelText('Fib')[0]).toHaveValue(3);
    expect(within(firstMeal).getAllByLabelText('Na')[0]).toHaveValue(5);
  });
});

describe('FoodRecallEditor (create mode)', () => {
  beforeEach(() => {
    useFoodRecall.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it('starts blank and creates via createFoodRecall, then navigates', async () => {
    render(<FoodRecallEditor patientId="p1" canEdit />);
    await userEvent.type(screen.getByLabelText(/observações/i), 'Primeiro dia');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(createMut).toHaveBeenCalledTimes(1));
    expect(createMut.mock.calls[0][0].patientId).toBe('p1');
    expect(createMut.mock.calls[0][0].notes).toBe('Primeiro dia');
    expect(notifyChapterActionSucceeded).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/patients/p1/recordatorios/new1');
  });

  it('does not navigate to the created recall when the tour consumed the save', async () => {
    notifyChapterActionSucceeded.mockResolvedValue(true);
    render(<FoodRecallEditor patientId="p1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(createMut).toHaveBeenCalledTimes(1));
    expect(notifyChapterActionSucceeded).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
