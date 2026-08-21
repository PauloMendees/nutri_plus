import { render, screen, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { MealLog } from '@nutri-plus/shared-types';

const mockUseMyMealLogs = jest.fn();
const mockUseMyMealPlans = jest.fn();
const mockUseMyMealPlan = jest.fn();
const mockMutateUpdate = jest.fn();
const mockMutateDelete = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'log-1' }),
  router: { back: () => mockBack() },
}));

jest.mock('../../../lib/queries/meal-logs', () => ({
  useMyMealLogs: () => mockUseMyMealLogs(),
  useUpdateMealLog: () => ({ mutateAsync: mockMutateUpdate, isPending: false }),
  useDeleteMealLog: () => ({ mutateAsync: mockMutateDelete, isPending: false }),
}));

jest.mock('../../../lib/queries/meal-plans', () => ({
  useMyMealPlans: () => mockUseMyMealPlans(),
  useMyMealPlan: () => mockUseMyMealPlan(),
}));

import DiarioEdit from './[id]';

function lockedLog(overrides: Partial<MealLog> = {}): MealLog {
  return {
    id: 'log-1',
    patientId: 'p1',
    consumedAt: '2026-08-20T12:00:00.000Z',
    source: 'PLAN',
    note: null,
    freeText: null,
    mealName: 'Almoço',
    mealTimeLabel: '12h',
    optionLabel: 'Opção A',
    itemsJson: null,
    mealPlanId: 'pl',
    mealId: 'm',
    mealOptionId: 'o',
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-20T12:00:00.000Z',
    editableUntil: '2020-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockUseMyMealLogs.mockReset();
  mockUseMyMealPlans.mockReset();
  mockUseMyMealPlan.mockReset();
  mockMutateUpdate.mockReset();
  mockMutateDelete.mockReset();
  mockBack.mockReset();
  mockUseMyMealLogs.mockReturnValue({
    isLoading: false,
    isError: false,
    data: [lockedLog()],
  });
  mockUseMyMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [] });
  mockUseMyMealPlan.mockReturnValue({ isLoading: false, isError: false, data: undefined });
});

describe('Diário edit', () => {
  it('alerts when locked log Editar or Apagar is pressed', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<DiarioEdit />);
    await fireEvent.press(screen.getByRole('button', { name: /editar/i }));
    expect(alertSpy).toHaveBeenCalledWith(
      'Diário',
      'Só é possível editar ou apagar uma refeição nas primeiras 24 horas.',
    );
    await fireEvent.press(screen.getByRole('button', { name: /apagar/i }));
    expect(alertSpy).toHaveBeenCalledWith(
      'Diário',
      'Só é possível editar ou apagar uma refeição nas primeiras 24 horas.',
    );
    alertSpy.mockRestore();
  });
});
