import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiFetch: (...a: unknown[]) => browserApiFetch(...a),
  browserApiDownload: vi.fn(),
}));

import { listAiJobs, getAiJob, retryAiJob, consumeAiJob } from './ai-jobs';

beforeEach(() => browserApiFetch.mockReset().mockResolvedValue([]));

describe('ai-jobs api', () => {
  it('lista por paciente', async () => {
    await listAiJobs('p1');
    expect(browserApiFetch).toHaveBeenCalledWith('/ai/jobs?patientId=p1');
  });

  it('busca um job', async () => {
    await getAiJob('j1');
    expect(browserApiFetch).toHaveBeenCalledWith('/ai/jobs/j1');
  });

  it('repete um job', async () => {
    await retryAiJob('j1');
    expect(browserApiFetch).toHaveBeenCalledWith('/ai/jobs/j1/retry', { method: 'POST' });
  });

  it('marca como consumido', async () => {
    await consumeAiJob('j1');
    expect(browserApiFetch).toHaveBeenCalledWith('/ai/jobs/j1/consume', { method: 'POST' });
  });
});
