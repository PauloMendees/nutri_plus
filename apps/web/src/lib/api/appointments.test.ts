import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({ browserApiFetch: (...a: unknown[]) => browserApiFetch(...a) }));

import {
  listAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  deleteAppointment,
} from './appointments';

beforeEach(() => browserApiFetch.mockReset().mockResolvedValue(undefined));

describe('appointments API', () => {
  it('lists with from/to query params', async () => {
    await listAppointments({ from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' });
    expect(browserApiFetch).toHaveBeenCalledWith(
      '/appointments?from=2026-06-01T00%3A00%3A00.000Z&to=2026-07-01T00%3A00%3A00.000Z',
    );
  });

  it('lists without query when none given', async () => {
    await listAppointments();
    expect(browserApiFetch).toHaveBeenCalledWith('/appointments');
  });

  it('gets one by id', async () => {
    await getAppointment('a1');
    expect(browserApiFetch).toHaveBeenCalledWith('/appointments/a1');
  });

  it('creates with POST + body', async () => {
    const body = { title: 'X', startsAt: 's', endsAt: 'e' };
    await createAppointment(body);
    expect(browserApiFetch).toHaveBeenCalledWith('/appointments', { method: 'POST', body });
  });

  it('updates with PATCH + body', async () => {
    await updateAppointment('a1', { title: 'Y' });
    expect(browserApiFetch).toHaveBeenCalledWith('/appointments/a1', {
      method: 'PATCH',
      body: { title: 'Y' },
    });
  });

  it('deletes with DELETE', async () => {
    await deleteAppointment('a1');
    expect(browserApiFetch).toHaveBeenCalledWith('/appointments/a1', { method: 'DELETE' });
  });
});
