import { render, screen, fireEvent } from '@testing-library/react-native';
import type { MealLog } from '@nutri-plus/shared-types';

const mockUseMyMealLogs = jest.fn();
jest.mock('../../../lib/queries/meal-logs', () => ({ useMyMealLogs: () => mockUseMyMealLogs() }));
jest.mock('../../../components/brand/brand-header', () => ({
  BrandHeader: () => {
    const { Text } = require('react-native');
    return <Text>BrandHeader</Text>;
  },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (h: unknown) => mockPush(h) } }));

import DiarioIndex from './index';

function planLog(overrides: Partial<MealLog> = {}): MealLog {
  return {
    id: '1',
    patientId: 'p1',
    consumedAt: '2026-08-21T15:00:00.000Z',
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
    createdAt: '2026-08-21T15:00:00.000Z',
    updatedAt: '2026-08-21T15:00:00.000Z',
    editableUntil: '2026-08-22T15:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockUseMyMealLogs.mockReset();
  mockPush.mockReset();
});

describe('Diário index', () => {
  it('shows the empty copy and register button', async () => {
    mockUseMyMealLogs.mockReturnValue({ isLoading: false, isError: false, data: [] });
    await render(<DiarioIndex />);
    expect(screen.getByText('Nenhuma refeição registrada ainda.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /registrar refeição/i })).toBeTruthy();
    expect(screen.getByTestId('meal-diary-register-footer')).toBeTruthy();
  });

  it('keeps the register button in the footer when logs exist', async () => {
    mockUseMyMealLogs.mockReturnValue({ isLoading: false, isError: false, data: [planLog()] });
    await render(<DiarioIndex />);
    expect(screen.getByTestId('meal-diary-register-footer')).toBeTruthy();
    expect(screen.getByRole('button', { name: /registrar refeição/i })).toBeTruthy();
  });

  it('shows a PLAN log meal name', async () => {
    mockUseMyMealLogs.mockReturnValue({ isLoading: false, isError: false, data: [planLog()] });
    await render(<DiarioIndex />);
    expect(screen.getByText(/almoço/i)).toBeTruthy();
  });

  it('falls back when PLAN mealName or optionLabel is null', async () => {
    mockUseMyMealLogs.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [planLog({ mealName: null, optionLabel: null })],
    });
    await render(<DiarioIndex />);
    expect(screen.getByText('Refeição · Opção')).toBeTruthy();
    expect(screen.queryByText(/null/)).toBeNull();
  });

  it('shows a loading state', async () => {
    mockUseMyMealLogs.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    await render(<DiarioIndex />);
    expect(screen.getByTestId('meal-diary-loading')).toBeTruthy();
  });

  it('shows an error state with retry', async () => {
    const refetch = jest.fn();
    mockUseMyMealLogs.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch });
    await render(<DiarioIndex />);
    await fireEvent.press(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('navigates to nova on Registrar refeição', async () => {
    mockUseMyMealLogs.mockReturnValue({ isLoading: false, isError: false, data: [] });
    await render(<DiarioIndex />);
    await fireEvent.press(screen.getByRole('button', { name: /registrar refeição/i }));
    expect(mockPush).toHaveBeenCalledWith('/diario/nova');
  });

  it('navigates to the log on row tap', async () => {
    mockUseMyMealLogs.mockReturnValue({ isLoading: false, isError: false, data: [planLog({ id: 'log-9' })] });
    await render(<DiarioIndex />);
    await fireEvent.press(screen.getByText(/almoço/i));
    expect(mockPush).toHaveBeenCalledWith('/diario/log-9');
  });
});
