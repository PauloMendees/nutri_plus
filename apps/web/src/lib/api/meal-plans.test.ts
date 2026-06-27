import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiFetch: (...args: unknown[]) => browserApiFetch(...args),
}));

import {
  listMealPlans,
  getMealPlan,
  createMealPlan,
  updateMealPlan,
  deleteMealPlan,
  generateMealPlan,
} from './meal-plans';

beforeEach(() => browserApiFetch.mockReset().mockResolvedValue(undefined));

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
