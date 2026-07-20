import { UserRole } from '@nutri-plus/shared-types';

/** Roles allowed in the web dashboard. Patients use the mobile app only. */
export function isWebDashboardRole(role: UserRole): boolean {
  return role !== UserRole.PATIENT;
}

/** Only nutritionists can create or edit patients (employees are read-only). */
export function canManagePatients(role: UserRole): boolean {
  return role === UserRole.NUTRITIONIST;
}

/** Only nutritionists can view/manage the employees module. */
export function canManageEmployees(role: UserRole): boolean {
  return role === UserRole.NUTRITIONIST;
}

/** Only nutritionists can open the settings page. */
export function canManageSettings(role: UserRole): boolean {
  return role === UserRole.NUTRITIONIST;
}

/** Only nutritionists browse the food catalog (the search API is nutritionist-only). */
export function canBrowseFoods(role: UserRole): boolean {
  return role === UserRole.NUTRITIONIST;
}
