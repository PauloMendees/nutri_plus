import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiFetch: (...args: unknown[]) => browserApiFetch(...args),
}));

import { listEmployees, inviteEmployee, updateEmployee, deleteEmployee } from './employees';

beforeEach(() => {
  browserApiFetch.mockReset().mockResolvedValue(undefined);
});

describe('employees API', () => {
  it('lists employees with a GET to /employees', async () => {
    await listEmployees();
    expect(browserApiFetch).toHaveBeenCalledWith('/employees');
  });

  it('invites with a POST and the body', async () => {
    await inviteEmployee({ name: 'Ana', email: 'ana@x.com' });
    expect(browserApiFetch).toHaveBeenCalledWith('/employees', {
      method: 'POST',
      body: { name: 'Ana', email: 'ana@x.com' },
    });
  });

  it('updates with a PATCH to the id path', async () => {
    await updateEmployee('e1', { name: 'Ana B' });
    expect(browserApiFetch).toHaveBeenCalledWith('/employees/e1', {
      method: 'PATCH',
      body: { name: 'Ana B' },
    });
  });

  it('deletes with a DELETE to the id path', async () => {
    await deleteEmployee('e1');
    expect(browserApiFetch).toHaveBeenCalledWith('/employees/e1', { method: 'DELETE' });
  });
});
