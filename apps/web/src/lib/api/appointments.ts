import type {
  Appointment,
  CreateAppointmentRequest,
  ListAppointmentsQuery,
  UpdateAppointmentRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listAppointments(query: ListAppointmentsQuery = {}): Promise<Appointment[]> {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  const qs = params.toString();
  return browserApiFetch<Appointment[]>(`/appointments${qs ? `?${qs}` : ''}`);
}

export function getAppointment(id: string): Promise<Appointment> {
  return browserApiFetch<Appointment>(`/appointments/${id}`);
}

export function createAppointment(body: CreateAppointmentRequest): Promise<Appointment> {
  return browserApiFetch<Appointment>('/appointments', { method: 'POST', body });
}

export function updateAppointment(id: string, body: UpdateAppointmentRequest): Promise<Appointment> {
  return browserApiFetch<Appointment>(`/appointments/${id}`, { method: 'PATCH', body });
}

export function deleteAppointment(id: string): Promise<void> {
  return browserApiFetch<void>(`/appointments/${id}`, { method: 'DELETE' });
}
