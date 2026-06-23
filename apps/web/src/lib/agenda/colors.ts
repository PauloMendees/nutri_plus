import type { Appointment } from '@nutri-plus/shared-types';

/** The category color for an appointment, or null to fall back to the brand class. */
export function appointmentColor(
  appointment: Pick<Appointment, 'category'>,
): string | null {
  return appointment.category?.color ?? null;
}
