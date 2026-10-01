import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: () => getCurrentUser() }));
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
vi.mock('@/components/admin/nutritionist-detail', () => ({ AdminNutritionistDetail: () => null }));

import AdminNutritionistPage from './page';

const params = Promise.resolve({ id: 'n1' });

beforeEach(() => {
  getCurrentUser.mockReset();
  notFound.mockClear();
});

describe('AdminNutritionistPage', () => {
  it('is a 404 for users who are not admins', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u', role: 'NUTRITIONIST', isAdmin: false });
    await expect(AdminNutritionistPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('is a 404 without a session', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(AdminNutritionistPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders for an admin', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u', role: 'NUTRITIONIST', isAdmin: true });
    await expect(AdminNutritionistPage({ params })).resolves.toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });
});
