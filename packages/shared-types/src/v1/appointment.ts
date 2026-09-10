import type { AppointmentCategorySummary } from './appointment-category';

export interface AppointmentPatientSummary {
  id: string;
  name: string;
  email: string | null;
  user: { id: string } | null;
}

// Dates are ISO strings over the wire.
export interface Appointment {
  id: string;
  nutritionistId: string;
  patientId: string | null;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
  patient: AppointmentPatientSummary | null;
  categoryId?: string | null;
  category?: AppointmentCategorySummary | null;
}

export interface CreateAppointmentRequest {
  title: string;
  startsAt: string;
  endsAt: string;
  description?: string;
  patientId?: string;
  categoryId?: string;
}

export interface UpdateAppointmentRequest {
  title?: string;
  startsAt?: string;
  endsAt?: string;
  description?: string | null;
  patientId?: string | null;
  categoryId?: string | null;
}

export interface ListAppointmentsQuery {
  from?: string;
  to?: string;
}
