import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiFetch: (...args: unknown[]) => browserApiFetch(...args),
}));

import {
  listAssessments,
  createAssessment,
  updateAssessment,
  deleteAssessment,
} from './assessments';

beforeEach(() => browserApiFetch.mockReset().mockResolvedValue(undefined));

describe('assessments API', () => {
  it('lists with a GET to the patient assessments path', async () => {
    await listAssessments('p1');
    expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1/assessments');
  });
  it('creates with a POST and body', async () => {
    await createAssessment('p1', { weight: 80 });
    expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1/assessments', {
      method: 'POST',
      body: { weight: 80 },
    });
  });
  it('updates with a PATCH to the assessment path', async () => {
    await updateAssessment('p1', 'a1', { weight: 81 });
    expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1/assessments/a1', {
      method: 'PATCH',
      body: { weight: 81 },
    });
  });
  it('deletes with a DELETE to the assessment path', async () => {
    await deleteAssessment('p1', 'a1');
    expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1/assessments/a1', {
      method: 'DELETE',
    });
  });
});
