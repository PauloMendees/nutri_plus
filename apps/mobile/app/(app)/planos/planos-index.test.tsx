import { render, screen } from '@testing-library/react-native';

const mockUseMyMealPlans = jest.fn();
jest.mock('../../../lib/queries/meal-plans', () => ({ useMyMealPlans: () => mockUseMyMealPlans() }));
jest.mock('../../../components/meal-plan/meal-plan-view', () => ({
  MealPlanView: ({ planId }: { planId: string }) => {
    const { Text } = require('react-native');
    return <Text>view:{planId}</Text>;
  },
}));
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: unknown }) => children,
}));

import PlanosIndex from './index';

beforeEach(() => mockUseMyMealPlans.mockReset());

describe('Planos index', () => {
  it('empty state when no visible plans', async () => {
    mockUseMyMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [] });
    await render(<PlanosIndex />);
    expect(screen.getByText('Nenhum plano disponível ainda.')).toBeTruthy();
  });

  it('auto-opens the single plan inline', async () => {
    mockUseMyMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [{ id: 'm1', title: 'A' }] });
    await render(<PlanosIndex />);
    expect(screen.getByText('view:m1')).toBeTruthy();
  });

  it('shows a picker for more than one plan', async () => {
    mockUseMyMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [{ id: 'm1', title: 'A' }, { id: 'm2', title: 'B' }] });
    await render(<PlanosIndex />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.queryByText('view:m1')).toBeNull();
  });
});
