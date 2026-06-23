import type {
  AppointmentCategory,
  CreateAppointmentCategoryRequest,
  UpdateAppointmentCategoryRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listAppointmentCategories(): Promise<AppointmentCategory[]> {
  return browserApiFetch<AppointmentCategory[]>('/appointment-categories');
}

export function createAppointmentCategory(
  body: CreateAppointmentCategoryRequest,
): Promise<AppointmentCategory> {
  return browserApiFetch<AppointmentCategory>('/appointment-categories', { method: 'POST', body });
}

export function updateAppointmentCategory(
  id: string,
  body: UpdateAppointmentCategoryRequest,
): Promise<AppointmentCategory> {
  return browserApiFetch<AppointmentCategory>(`/appointment-categories/${id}`, {
    method: 'PATCH',
    body,
  });
}

export function deleteAppointmentCategory(id: string): Promise<void> {
  return browserApiFetch<void>(`/appointment-categories/${id}`, { method: 'DELETE' });
}
