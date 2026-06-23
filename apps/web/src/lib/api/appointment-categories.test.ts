import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({ browserApiFetch: (...a: unknown[]) => browserApiFetch(...a) }));

import {
  listAppointmentCategories,
  createAppointmentCategory,
  updateAppointmentCategory,
  deleteAppointmentCategory,
} from './appointment-categories';

beforeEach(() => browserApiFetch.mockReset().mockResolvedValue(undefined));

describe('appointment categories API', () => {
  it('lists', async () => {
    await listAppointmentCategories();
    expect(browserApiFetch).toHaveBeenCalledWith('/appointment-categories');
  });
  it('creates with POST + body', async () => {
    const body = { name: 'Consulta', color: '#14BFA6', isDefault: true };
    await createAppointmentCategory(body);
    expect(browserApiFetch).toHaveBeenCalledWith('/appointment-categories', { method: 'POST', body });
  });
  it('updates with PATCH + body', async () => {
    await updateAppointmentCategory('c1', { name: 'X' });
    expect(browserApiFetch).toHaveBeenCalledWith('/appointment-categories/c1', {
      method: 'PATCH',
      body: { name: 'X' },
    });
  });
  it('deletes', async () => {
    await deleteAppointmentCategory('c1');
    expect(browserApiFetch).toHaveBeenCalledWith('/appointment-categories/c1', { method: 'DELETE' });
  });
});
