import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole } from '@nutri-plus/shared-types';

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/components/foods/foods-browse', () => ({
  FoodsBrowse: () => <div>foods-browse</div>,
}));

import AlimentosPage from './page';

function me(role: UserRole) {
  return { id: 'u1', email: 'x@y.com', name: 'X', role };
}

beforeEach(() => getCurrentUser.mockReset());

describe('AlimentosPage guard', () => {
  it('shows the foods browse for a nutritionist', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.NUTRITIONIST));
    render(await AlimentosPage());
    expect(screen.getByText('foods-browse')).toBeInTheDocument();
  });

  it('shows Não autorizado for an employee', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.EMPLOYEE));
    render(await AlimentosPage());
    expect(screen.getByText(/não autorizado/i)).toBeInTheDocument();
    expect(screen.queryByText('foods-browse')).not.toBeInTheDocument();
  });

  it('shows Não autorizado when there is no current user', async () => {
    getCurrentUser.mockResolvedValue(null);
    render(await AlimentosPage());
    expect(screen.getByText(/não autorizado/i)).toBeInTheDocument();
    expect(screen.queryByText('foods-browse')).not.toBeInTheDocument();
  });
});
