import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
const apiFetch = vi.fn();

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getSession } }) }));
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { browserApiFetch, browserToken } from './browser';

beforeEach(() => {
  getSession.mockReset();
  apiFetch.mockReset();
});

describe('browser API', () => {
  it('attaches the session token to apiFetch', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    apiFetch.mockResolvedValue({ ok: true });
    const result = await browserApiFetch('/patients', { method: 'POST', body: { a: 1 } });
    expect(result).toEqual({ ok: true });
    expect(apiFetch).toHaveBeenCalledWith('/patients', { token: 'tok', method: 'POST', body: { a: 1 } });
  });
  it('throws when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(browserToken()).rejects.toThrow(/sess/i);
  });
});
