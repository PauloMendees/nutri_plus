import { describe, it, expect, vi, beforeEach } from 'vitest';

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
const getSession = vi.fn();
const syncUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp, getSession } }),
}));
vi.mock('@/lib/api/auth', () => ({ syncUser: (...a: unknown[]) => syncUser(...a) }));

import { GET } from './route';

function req(url: string) {
  return new Request(url) as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  verifyOtp.mockReset();
  getSession.mockReset();
  syncUser.mockReset();
});

describe('GET /auth/callback', () => {
  it('exchanges the code, syncs the profile, and redirects to /assinatura', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    syncUser.mockResolvedValue({});

    const res = await GET(req('http://localhost:3001/auth/callback?code=abc'));

    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(syncUser).toHaveBeenCalledWith('tok', 'NUTRITIONIST');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3001/assinatura');
  });

  it('forwards a landing plan query to /assinatura after sync', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    syncUser.mockResolvedValue({});

    const res = await GET(req('http://localhost:3001/auth/callback?code=abc&plan=pro'));

    expect(syncUser).toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('http://localhost:3001/assinatura?plan=pro');
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

  it('redirects to /login with an error when syncUser throws', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    syncUser.mockRejectedValue(new Error('network fail'));

    const res = await GET(req('http://localhost:3001/auth/callback?code=abc'));

    expect(res.headers.get('location')).toContain('/login?error=');
  });

  it('redirects to a safe `next` after exchange without syncing (recovery)', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const res = await GET(
      req('http://localhost:3001/auth/callback?code=abc&next=/reset-password'),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(syncUser).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3001/reset-password');
  });

  it('ignores an unsafe `next` (open-redirect guard) and falls back to signup sync', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    syncUser.mockResolvedValue({});

    const res = await GET(
      req('http://localhost:3001/auth/callback?code=abc&next=//evil.com'),
    );

    expect(syncUser).toHaveBeenCalledWith('tok', 'NUTRITIONIST');
    expect(res.headers.get('location')).toBe('http://localhost:3001/assinatura');
  });

  // Fluxo stateless (token_hash): o link do e-mail e' aberto em aparelho/browser
  // imprevisivel, onde o code_verifier do PKCE nao existe.
  it('aceita token_hash, sincroniza o perfil e vai para /assinatura', async () => {
    verifyOtp.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    syncUser.mockResolvedValue({});

    const res = await GET(
      req('http://localhost:3001/auth/callback?token_hash=hh&type=signup'),
    );

    expect(verifyOtp).toHaveBeenCalledWith({ type: 'signup', token_hash: 'hh' });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(syncUser).toHaveBeenCalledWith('tok', 'NUTRITIONIST');
    expect(res.headers.get('location')).toBe('http://localhost:3001/assinatura');
  });

  it('token_hash preserva o plano escolhido', async () => {
    verifyOtp.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    syncUser.mockResolvedValue({});

    const res = await GET(
      req('http://localhost:3001/auth/callback?token_hash=hh&type=signup&plan=pro'),
    );

    expect(res.headers.get('location')).toBe('http://localhost:3001/assinatura?plan=pro');
  });

  it('token_hash invalido volta para /login com erro', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'expired' } });

    const res = await GET(
      req('http://localhost:3001/auth/callback?token_hash=hh&type=signup'),
    );

    expect(res.headers.get('location')).toContain('/login?error=');
    expect(syncUser).not.toHaveBeenCalled();
  });

  it('token_hash sem type assume signup', async () => {
    verifyOtp.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    syncUser.mockResolvedValue({});

    await GET(req('http://localhost:3001/auth/callback?token_hash=hh'));

    expect(verifyOtp).toHaveBeenCalledWith({ type: 'signup', token_hash: 'hh' });
  });

  it('recovery via token_hash respeita o next sem sincronizar', async () => {
    verifyOtp.mockResolvedValue({ error: null });

    const res = await GET(
      req('http://localhost:3001/auth/callback?token_hash=hh&type=recovery&next=/reset-password'),
    );

    expect(verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'hh' });
    expect(syncUser).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('http://localhost:3001/reset-password');
  });
});
