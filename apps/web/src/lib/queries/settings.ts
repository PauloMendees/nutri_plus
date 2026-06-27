import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateNutritionistSettingsRequest } from '@nutri-plus/shared-types';
import {
  deleteLogo,
  getNutritionistSettings,
  updateNutritionistSettings,
  uploadLogo,
} from '@/lib/api/settings';

export function useNutritionistSettings() {
  return useQuery({
    queryKey: ['nutritionist-settings'],
    queryFn: getNutritionistSettings,
  });
}

function useInvalidateSettings() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['nutritionist-settings'] });
}

export function useUpdateNutritionistSettings() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (body: UpdateNutritionistSettingsRequest) => updateNutritionistSettings(body),
    onSuccess: invalidate,
  });
}

export function useUploadLogo() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (file: File) => uploadLogo(file),
    onSuccess: invalidate,
  });
}

export function useDeleteLogo() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: () => deleteLogo(),
    onSuccess: invalidate,
  });
}
