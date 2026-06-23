import { UserRole } from '@nutri-plus/shared-types';

/** Roles allowed in the web dashboard. Patients use the mobile app only. */
export function isWebDashboardRole(role: UserRole): boolean {
  return role !== UserRole.PATIENT;
}
