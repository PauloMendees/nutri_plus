import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({ browserApiFetch: (...args: unknown[]) => browserApiFetch(...args) }));

import { searchFoods } from './foods';

beforeEach(() => browserApiFetch.mockReset().mockResolvedValue([]));

describe('foods API', () => {
  it('searches with the term and default limit', async () => {
    await searchFoods('arroz');
    expect(browserApiFetch).toHaveBeenCalledWith('/foods?q=arroz&limit=20');
  });

  it('searches with a custom limit', async () => {
    await searchFoods('arroz', 5);
    expect(browserApiFetch).toHaveBeenCalledWith('/foods?q=arroz&limit=5');
  });

  it('encodes special characters in the query term', async () => {
    await searchFoods('açúcar & mel');
    expect(browserApiFetch).toHaveBeenCalledWith(
      `/foods?q=${encodeURIComponent('açúcar & mel')}&limit=20`,
    );
  });
});
