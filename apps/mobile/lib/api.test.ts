const mockGetSession = jest.fn();
jest.mock('./supabase', () => ({ supabase: { auth: { getSession: () => mockGetSession() } } }));

import { apiFetch, ApiError } from './api';

const fetchMock = jest.fn();

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
});

describe('apiFetch', () => {
  it('sends the bearer token to {base}/v1{path} and parses JSON', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: () => Promise.resolve('{"id":"p1"}') });
    const result = await apiFetch<{ id: string }>('/me/meal-plans');
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/v1/me/meal-plans', {
      method: 'GET',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer tok' },
      body: undefined,
    });
    expect(result).toEqual({ id: 'p1' });
  });

  it('throws ApiError on a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('nope') });
    await expect(apiFetch('/me/meal-plans')).rejects.toBeInstanceOf(ApiError);
  });
});
