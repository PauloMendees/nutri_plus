import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
const browserApiDownload = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiFetch: (...args: unknown[]) => browserApiFetch(...args),
  browserApiDownload: (...args: unknown[]) => browserApiDownload(...args),
}));

import {
  listMealPlans,
  getMealPlan,
  createMealPlan,
  updateMealPlan,
  deleteMealPlan,
  generateMealPlan,
  downloadMealPlanPdf,
} from './meal-plans';

beforeEach(() => {
  browserApiFetch.mockReset().mockResolvedValue(undefined);
  browserApiDownload.mockReset().mockResolvedValue(new Blob());
});

describe('meal-plans API', () => {
  it('lists with the patientId query', async () => {
    await listMealPlans('p1');
    expect(browserApiFetch).toHaveBeenCalledWith('/meal-plans?patientId=p1');
  });
  it('gets one by id', async () => {
    await getMealPlan('m1');
    expect(browserApiFetch).toHaveBeenCalledWith('/meal-plans/m1');
  });
  it('creates with POST and body', async () => {
    await createMealPlan({ patientId: 'p1', title: 'Plano' });
    expect(browserApiFetch).toHaveBeenCalledWith('/meal-plans', {
      method: 'POST',
      body: { patientId: 'p1', title: 'Plano' },
    });
  });
  it('updates with PATCH and body', async () => {
    await updateMealPlan('m1', { title: 'Novo' });
    expect(browserApiFetch).toHaveBeenCalledWith('/meal-plans/m1', {
      method: 'PATCH',
      body: { title: 'Novo' },
    });
  });
  it('deletes with DELETE', async () => {
    await deleteMealPlan('m1');
    expect(browserApiFetch).toHaveBeenCalledWith('/meal-plans/m1', { method: 'DELETE' });
  });
  it('generates via the ai endpoint (no instructions)', async () => {
    await generateMealPlan('p1');
    expect(browserApiFetch).toHaveBeenCalledWith('/ai/generate-meal-plan', {
      method: 'POST',
      body: { patientId: 'p1', instructions: undefined },
    });
  });
  it('generates with custom instructions', async () => {
    await generateMealPlan('p1', 'Apenas 4 refeições');
    expect(browserApiFetch).toHaveBeenCalledWith('/ai/generate-meal-plan', {
      method: 'POST',
      body: { patientId: 'p1', instructions: 'Apenas 4 refeições' },
    });
  });
});

describe('downloadMealPlanPdf', () => {
  it('fetches the pdf blob and triggers a download', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    browserApiDownload.mockReset().mockResolvedValue(blob);
    const createObjectURL = vi.fn().mockReturnValue('blob:url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL } as unknown as typeof URL);
    const click = vi.fn();
    const anchor = { href: '', download: '', click, remove: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);

    await downloadMealPlanPdf('m1');

    expect(browserApiDownload).toHaveBeenCalledWith('/meal-plans/m1/pdf');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.download).toBe('plano-alimentar.pdf');
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:url');
  });
});
