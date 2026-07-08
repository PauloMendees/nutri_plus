import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, apiDownload, ApiError } from './client';

const ORIGINAL = process.env.NEXT_PUBLIC_API_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://api.test';
});
afterEach(() => {
  process.env.NEXT_PUBLIC_API_URL = ORIGINAL;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('apiDownload', () => {
  it('GETs the path with the bearer token + pdf Accept and returns the blob', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiDownload('/meal-plans/m1/pdf', { token: 'tok' });

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/v1/meal-plans/m1/pdf', {
      headers: { Authorization: 'Bearer tok', Accept: 'application/pdf' },
      cache: 'no-store',
    });
    expect(result).toBe(blob);
  });

  it('throws ApiError on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('nope') }));
    await expect(apiDownload('/meal-plans/x/pdf', { token: 't' })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('apiFetch', () => {
  it('builds the /v1 URL, attaches the bearer token, and parses JSON', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const result = await apiFetch<{ ok: boolean }>('/auth/me', { token: 'abc' });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/auth/me');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer abc');
  });

  it('throws ApiError with the status on a non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'nope' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(apiFetch('/auth/me', { token: 'x' })).rejects.toMatchObject({
      status: 409,
      body: { message: 'nope' },
    });
    await expect(apiFetch('/auth/me', { token: 'x' })).rejects.toBeInstanceOf(ApiError);
  });

  it('yields an ApiError (not a parse error) on a non-JSON error body', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );
    await expect(apiFetch('/auth/me', { token: 'x' })).rejects.toMatchObject({
      status: 502,
      body: '<html>502 Bad Gateway</html>',
    });
  });
});
