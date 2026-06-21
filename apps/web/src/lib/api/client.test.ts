import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, ApiError } from './client';

const ORIGINAL = process.env.NEXT_PUBLIC_API_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://api.test';
});
afterEach(() => {
  process.env.NEXT_PUBLIC_API_URL = ORIGINAL;
  vi.restoreAllMocks();
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'nope' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(apiFetch('/auth/me', { token: 'x' })).rejects.toMatchObject({
      status: 409,
    });
    await expect(apiFetch('/auth/me', { token: 'x' })).rejects.toBeInstanceOf(ApiError);
  });
});
