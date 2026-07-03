import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockUseMyMealPlan = jest.fn();
const mockDownload = jest.fn();
jest.mock('../../lib/queries/meal-plans', () => ({
  useMyMealPlan: () => mockUseMyMealPlan(),
  downloadMealPlanPdf: (...a: unknown[]) => mockDownload(...a),
}));

import { MealPlanView } from './meal-plan-view';

const plan = {
  id: 'm1',
  title: 'Plano de Emagrecimento',
  objective: 'Emagrecer',
  targetCalories: 1800,
  targetProtein: 120,
  targetCarbs: 180,
  targetFats: 60,
  meals: [
    { id: 'meal1', name: 'Café da manhã', timeLabel: '08:00', instructions: null, order: 0,
      options: [{ id: 'o1', label: 'Opção 1', order: 0, items: [
        { id: 'i1', foodName: 'Ovos', quantity: '2 un', calories: 140, protein: 12, carbs: 1, fats: 10, order: 0 },
      ] }] },
  ],
};

beforeEach(() => {
  mockUseMyMealPlan.mockReset();
  mockDownload.mockReset().mockResolvedValue(undefined);
});

describe('MealPlanView', () => {
  it('shows a loading state', async () => {
    mockUseMyMealPlan.mockReturnValue({ isLoading: true });
    await render(<MealPlanView planId="m1" />);
    expect(screen.getByTestId('meal-plan-loading')).toBeTruthy();
  });

  it('renders the plan tree and downloads the PDF', async () => {
    mockUseMyMealPlan.mockReturnValue({ isLoading: false, isError: false, data: plan });
    await render(<MealPlanView planId="m1" />);
    expect(screen.getByText('Plano de Emagrecimento')).toBeTruthy();
    expect(screen.getByText('Café da manhã')).toBeTruthy();
    expect(screen.getByText('Ovos')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /baixar pdf/i }));
    await waitFor(() => expect(mockDownload).toHaveBeenCalledWith('m1'));
  });
});
