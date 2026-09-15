import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();

import { POST } from './route';

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3001/api/signup-gate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-1');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('POST /api/signup-gate', () => {
  it('204 quando a Cloudflare confirma o token; manda secret, token e IP do cliente', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    const res = await POST(post({ token: 'tok-1' }, { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }));
    expect(res.status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const sent = init.body as URLSearchParams;
    expect(sent.get('secret')).toBe('secret-1');
    expect(sent.get('response')).toBe('tok-1');
    expect(sent.get('remoteip')).toBe('203.0.113.7');
  });

  it('403 CAPTCHA_FAILED quando a Cloudflare recusa', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }) });
    const res = await POST(post({ token: 'tok-1' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: 'CAPTCHA_FAILED' });
  });

  it('502 CAPTCHA_UNAVAILABLE quando a Cloudflare está fora (nunca aprova por falha)', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const res = await POST(post({ token: 'tok-1' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ code: 'CAPTCHA_UNAVAILABLE' });
  });

  it('502 CAPTCHA_UNAVAILABLE quando o fetch para a Cloudflare rejeita', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const res = await POST(post({ token: 'tok-1' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ code: 'CAPTCHA_UNAVAILABLE' });
  });

  it('400 sem token ou com corpo inválido', async () => {
    expect((await POST(post({}))).status).toBe(400);
    expect((await POST(post('not json'))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('503 CAPTCHA_NOT_CONFIGURED sem chave secreta (falha fechado)', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    const res = await POST(post({ token: 'tok-1' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: 'CAPTCHA_NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
