import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole } from '@nutri-plus/shared-types';

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/components/patients/meal-plan-editor', () => ({
  MealPlanEditor: () => <div>meal-plan-editor</div>,
}));

import NewMealPlanPage from './page';

function me(role: UserRole) {
  return { id: 'u1', email: 'x@y.com', name: 'X', role };
}

beforeEach(() => getCurrentUser.mockReset());

describe('NewMealPlanPage guard', () => {
  it('shows the editor for a nutritionist', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.NUTRITIONIST));
    render(await NewMealPlanPage({ params: Promise.resolve({ id: 'p1' }) }));
    expect(screen.getByText('meal-plan-editor')).toBeInTheDocument();
  });

  it('shows Não autorizado for an employee', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.EMPLOYEE));
    render(await NewMealPlanPage({ params: Promise.resolve({ id: 'p1' }) }));
    expect(screen.getByText(/não autorizado/i)).toBeInTheDocument();
    expect(screen.queryByText('meal-plan-editor')).not.toBeInTheDocument();
  });
});
