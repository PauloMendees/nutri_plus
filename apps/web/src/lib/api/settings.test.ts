import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
const browserApiUpload = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiFetch: (...a: unknown[]) => browserApiFetch(...a),
  browserApiUpload: (...a: unknown[]) => browserApiUpload(...a),
}));

import {
  getNutritionistSettings,
  updateNutritionistSettings,
  uploadLogo,
  deleteLogo,
} from './settings';

beforeEach(() => {
  browserApiFetch.mockReset().mockResolvedValue(undefined);
  browserApiUpload.mockReset().mockResolvedValue(undefined);
});

describe('settings API', () => {
  it('gets settings', async () => {
    await getNutritionistSettings();
    expect(browserApiFetch).toHaveBeenCalledWith('/me/nutritionist-settings');
  });
  it('updates with PATCH and body', async () => {
    await updateNutritionistSettings({ displayName: 'Dra. Ana' });
    expect(browserApiFetch).toHaveBeenCalledWith('/me/nutritionist-settings', {
      method: 'PATCH',
      body: { displayName: 'Dra. Ana' },
    });
  });
  it('uploads the logo as multipart form data', async () => {
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    await uploadLogo(file);
    expect(browserApiUpload).toHaveBeenCalledTimes(1);
    const [path, fd] = browserApiUpload.mock.calls[0];
    expect(path).toBe('/me/nutritionist-settings/logo');
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).get('file')).toBe(file);
  });
  it('deletes the logo', async () => {
    await deleteLogo();
    expect(browserApiFetch).toHaveBeenCalledWith('/me/nutritionist-settings/logo', { method: 'DELETE' });
  });
});
