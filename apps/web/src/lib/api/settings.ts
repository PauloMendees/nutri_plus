import type {
  NutritionistSettings,
  UpdateNutritionistSettingsRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch, browserApiUpload } from '@/lib/api/browser';

export function getNutritionistSettings(): Promise<NutritionistSettings> {
  return browserApiFetch<NutritionistSettings>('/me/nutritionist-settings');
}

export function updateNutritionistSettings(
  body: UpdateNutritionistSettingsRequest,
): Promise<NutritionistSettings> {
  return browserApiFetch<NutritionistSettings>('/me/nutritionist-settings', {
    method: 'PATCH',
    body,
  });
}

export function uploadLogo(file: File): Promise<NutritionistSettings> {
  const formData = new FormData();
  formData.append('file', file);
  return browserApiUpload<NutritionistSettings>('/me/nutritionist-settings/logo', formData);
}

export function deleteLogo(): Promise<NutritionistSettings> {
  return browserApiFetch<NutritionistSettings>('/me/nutritionist-settings/logo', {
    method: 'DELETE',
  });
}
