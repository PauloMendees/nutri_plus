import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
const browserApiDownload = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiFetch: (...a: unknown[]) => browserApiFetch(...a),
  browserApiDownload: (...a: unknown[]) => browserApiDownload(...a),
}));

import { adminQueryString, downloadAdminNutritionistsReport, listAdminNutritionists, listAdminPatients } from './admin';

beforeEach(() => {
  browserApiFetch.mockReset().mockResolvedValue({ items: [] });
  browserApiDownload.mockReset().mockResolvedValue(new Blob(['%PDF']));
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

describe('admin api', () => {
  it('builds a query string skipping empty values', () => {
    expect(adminQueryString({ search: 'ana', confirmed: undefined, plan: '', page: 2 })).toBe('?search=ana&page=2');
    expect(adminQueryString({})).toBe('');
  });

  it('lists nutritionists with filters and page', async () => {
    await listAdminNutritionists({ search: 'ana', confirmed: 'no', plan: 'TRIAL', createdFrom: '2026-09-01' }, 2);
    expect(browserApiFetch).toHaveBeenCalledWith(
      '/admin/nutritionists?search=ana&confirmed=no&plan=TRIAL&createdFrom=2026-09-01&page=2&pageSize=20',
    );
  });

  it('downloads the report with the active filters and no pagination', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      await downloadAdminNutritionistsReport({ plan: 'PRO' });
      expect(browserApiDownload).toHaveBeenCalledWith('/admin/nutritionists/report.pdf?plan=PRO');
      expect(click).toHaveBeenCalled();
    } finally {
      click.mockRestore();
    }
  });

  it('lists patients with search and page', async () => {
    await listAdminPatients('mar', 3);
    expect(browserApiFetch).toHaveBeenCalledWith('/admin/patients?search=mar&page=3&pageSize=20');
  });
});
