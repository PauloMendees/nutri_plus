import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: () => getCurrentUser() }));
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
vi.mock('@/components/admin/nutritionist-detail', () => ({ AdminNutritionistDetail: () => null }));

type DetailElement = { props: { id: string; backHref: string } };

import AdminNutritionistPage from './page';

const params = Promise.resolve({ id: 'n1' });
const searchParams = Promise.resolve({});

beforeEach(() => {
  getCurrentUser.mockReset();
  notFound.mockClear();
});

describe('AdminNutritionistPage', () => {
  it('is a 404 for users who are not admins', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u', role: 'NUTRITIONIST', isAdmin: false });
    await expect(AdminNutritionistPage({ params, searchParams })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('is a 404 without a session', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(AdminNutritionistPage({ params, searchParams })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders for an admin', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u', role: 'NUTRITIONIST', isAdmin: true });
    await expect(AdminNutritionistPage({ params, searchParams })).resolves.toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });

  // "Voltar para o painel" reabre o painel com os filtros e a página de antes.
  it('links back to the panel query it came from', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u', role: 'NUTRITIONIST', isAdmin: true });
    const el = (await AdminNutritionistPage({
      params,
      searchParams: Promise.resolve({ voltar: 'tab=nutricionistas&plan=PRO&page=2' }),
    })) as unknown as DetailElement;
    expect(el.props).toEqual({ id: 'n1', backHref: '/admin?tab=nutricionistas&plan=PRO&page=2' });
  });
});
