export interface AppointmentPatientSummary {
  id: string;
  user: { id: string; name: string; email: string };
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
}

export interface CreateAppointmentRequest {
  title: string;
  startsAt: string;
  endsAt: string;
  description?: string;
  patientId?: string;
}

export interface UpdateAppointmentRequest {
  title?: string;
  startsAt?: string;
  endsAt?: string;
  description?: string | null;
  patientId?: string | null;
}

export interface ListAppointmentsQuery {
  from?: string;
  to?: string;
}
