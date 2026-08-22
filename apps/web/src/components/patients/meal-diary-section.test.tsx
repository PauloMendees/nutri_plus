import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const usePatientMealLogs = vi.fn();
vi.mock('@/lib/queries/meal-logs', () => ({
  usePatientMealLogs: (...a: unknown[]) => usePatientMealLogs(...a),
}));

import { MealDiarySection } from './meal-diary-section';

beforeEach(() => {
  usePatientMealLogs.mockReset();
});

describe('MealDiarySection', () => {
  it('shows the empty copy', () => {
    usePatientMealLogs.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<MealDiarySection patientId="p1" />);
    expect(screen.getByText(/o paciente ainda não registrou refeições no aplicativo/i)).toBeInTheDocument();
    expect(document.querySelector('[data-tour="patients.diario"]')).toBeTruthy();
  });

  it('groups PLAN and FREE_TEXT rows by day', () => {
    usePatientMealLogs.mockReturnValue({
      isLoading: false, isError: false,
      data: [
        {
          id: '1', patientId: 'p1', consumedAt: '2026-08-21T15:00:00.000Z', source: 'PLAN',
          note: 'sem pão', freeText: null, mealName: 'Almoço', mealTimeLabel: '12h',
          optionLabel: 'Opção A', itemsJson: [{ foodName: 'Arroz', quantity: '100g', calories: 130, protein: 2, carbs: 28, fats: 0, grams: 100 }],
          mealPlanId: 'pl', mealId: 'm', mealOptionId: 'o', createdAt: '2026-08-21T15:00:00.000Z',
          updatedAt: '2026-08-21T15:00:00.000Z', editableUntil: '2026-08-22T15:00:00.000Z',
        },
        {
          id: '2', patientId: 'p1', consumedAt: '2026-08-21T18:00:00.000Z', source: 'FREE_TEXT',
          note: null, freeText: 'Pizza', mealName: null, mealTimeLabel: null, optionLabel: null,
          itemsJson: null, mealPlanId: null, mealId: null, mealOptionId: null,
          createdAt: '2026-08-21T18:00:00.000Z', updatedAt: '2026-08-21T18:00:00.000Z',
          editableUntil: '2026-08-22T18:00:00.000Z',
        },
      ],
    });
    render(<MealDiarySection patientId="p1" />);
    expect(screen.getByText(/almoço/i)).toBeInTheDocument();
    expect(screen.getByText(/opção a/i)).toBeInTheDocument();
    expect(screen.getByText(/arroz/i)).toBeInTheDocument();
    expect(screen.getByText(/pizza/i)).toBeInTheDocument();
    expect(screen.getByText(/sem pão/i)).toBeInTheDocument();
  });

  it('shows the loading state', () => {
    usePatientMealLogs.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    render(<MealDiarySection patientId="p1" />);
    expect(screen.getByTestId('meal-diary-loading')).toBeInTheDocument();
  });

  it('shows the error state with a retry action', async () => {
    const refetch = vi.fn();
    usePatientMealLogs.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch });
    render(<MealDiarySection patientId="p1" />);
    expect(screen.getByText(/erro ao carregar/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('requests the last 30 days by default and switches range', async () => {
    usePatientMealLogs.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<MealDiarySection patientId="p1" />);
    expect(usePatientMealLogs).toHaveBeenCalledWith('p1', { kind: 'preset', range: '30' });
    expect(screen.getByRole('button', { name: /^30$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^90$/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^tudo$/i }));
    expect(usePatientMealLogs).toHaveBeenCalledWith('p1', { kind: 'preset', range: 'all' });
  });

  it('filters by a custom date range and returns to a preset', async () => {
    usePatientMealLogs.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<MealDiarySection patientId="p1" />);
    fireEvent.change(screen.getByLabelText(/data inicial/i), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText(/data final/i), { target: { value: '2026-08-15' } });
    expect(usePatientMealLogs).toHaveBeenCalledWith('p1', {
      kind: 'custom',
      from: '2026-08-01',
      to: '2026-08-15',
    });
    await userEvent.click(screen.getByRole('button', { name: /^30$/ }));
    expect(usePatientMealLogs).toHaveBeenCalledWith('p1', { kind: 'preset', range: '30' });
  });

  it('falls back when PLAN mealName or optionLabel is null', () => {
    usePatientMealLogs.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        {
          id: '1', patientId: 'p1', consumedAt: '2026-08-21T15:00:00.000Z', source: 'PLAN',
          note: null, freeText: null, mealName: null, mealTimeLabel: null,
          optionLabel: null, itemsJson: null,
          mealPlanId: 'pl', mealId: 'm', mealOptionId: 'o', createdAt: '2026-08-21T15:00:00.000Z',
          updatedAt: '2026-08-21T15:00:00.000Z', editableUntil: '2026-08-22T15:00:00.000Z',
        },
      ],
    });
    render(<MealDiarySection patientId="p1" />);
    expect(screen.getByText('Refeição · Opção')).toBeInTheDocument();
    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
  });

  it('has no edit or delete controls', () => {
    usePatientMealLogs.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        {
          id: '1', patientId: 'p1', consumedAt: '2026-08-21T15:00:00.000Z', source: 'PLAN',
          note: null, freeText: null, mealName: 'Almoço', mealTimeLabel: '12h',
          optionLabel: 'Opção A', itemsJson: null,
          mealPlanId: 'pl', mealId: 'm', mealOptionId: 'o', createdAt: '2026-08-21T15:00:00.000Z',
          updatedAt: '2026-08-21T15:00:00.000Z', editableUntil: '2026-08-22T15:00:00.000Z',
        },
      ],
    });
    render(<MealDiarySection patientId="p1" />);
    expect(screen.queryByRole('button', { name: /editar|apagar|excluir|remover/i })).not.toBeInTheDocument();
  });
});
