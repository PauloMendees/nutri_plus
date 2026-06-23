import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({ browserApiFetch: (...a: unknown[]) => browserApiFetch(...a) }));

import { createPatient, getPatient, listPatients, updatePatient } from './patients';

beforeEach(() => browserApiFetch.mockReset());

describe('patients API', () => {
  it('lists patients', async () => {
    await listPatients();
    expect(browserApiFetch).toHaveBeenCalledWith('/patients');
  });
  it('gets one patient', async () => {
    await getPatient('p1');
    expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1');
  });
  it('creates a patient via POST', async () => {
    await createPatient({ name: 'Maria', email: 'm@x.com' });
    expect(browserApiFetch).toHaveBeenCalledWith('/patients', {
      method: 'POST',
      body: { name: 'Maria', email: 'm@x.com' },
    });
  });
  it('updates a patient via PATCH', async () => {
    await updatePatient('p1', { notes: 'ok' });
    expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1', { method: 'PATCH', body: { notes: 'ok' } });
  });
});
