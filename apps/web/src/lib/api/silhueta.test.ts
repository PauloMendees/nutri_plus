import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
const browserApiUpload = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiFetch: (...args: unknown[]) => browserApiFetch(...args),
  browserApiUpload: (...args: unknown[]) => browserApiUpload(...args),
}));

import { applySilhuetaScan, createSilhuetaScan, listSilhuetaScans } from './silhueta';

beforeEach(() => {
  browserApiFetch.mockReset().mockResolvedValue(undefined);
  browserApiUpload.mockReset().mockResolvedValue(undefined);
});

describe('silhueta API', () => {
  it('lists with a GET to the patient silhueta path', async () => {
    await listSilhuetaScans('p1');
    expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1/silhueta');
  });

  it('creates via multipart upload', async () => {
    const fd = new FormData();
    await createSilhuetaScan('p1', fd);
    expect(browserApiUpload).toHaveBeenCalledWith('/patients/p1/silhueta', fd);
  });

  it('applies with a POST to the apply path', async () => {
    await applySilhuetaScan('p1', 's1');
    expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1/silhueta/s1/apply', {
      method: 'POST',
    });
  });
});
