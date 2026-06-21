import { describe, it, expect, vi, beforeEach } from 'vitest';

const exchangeCodeForSession = vi.fn();
const getSession = vi.fn();
const syncUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, getSession } }),
}));
vi.mock('@/lib/api/auth', () => ({ syncUser: (...a: unknown[]) => syncUser(...a) }));

import { GET } from './route';

function req(url: string) {
  return new Request(url) as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  getSession.mockReset();
  syncUser.mockReset();
});

describe('GET /auth/callback', () => {
  it('exchanges the code, syncs the profile, and redirects to /', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    syncUser.mockResolvedValue({});

    const res = await GET(req('http://localhost:3001/auth/callback?code=abc'));

    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(syncUser).toHaveBeenCalledWith('tok', 'NUTRITIONIST');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3001/');
  });

  it('redirects to /login with an error when the code is missing', async () => {
    const res = await GET(req('http://localhost:3001/auth/callback'));
    expect(res.headers.get('location')).toContain('/login?error=');
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('redirects to /login with an error when the exchange fails', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'bad code' } });
    const res = await GET(req('http://localhost:3001/auth/callback?code=abc'));
    expect(res.headers.get('location')).toContain('/login?error=');
    expect(syncUser).not.toHaveBeenCalled();
  });
});
