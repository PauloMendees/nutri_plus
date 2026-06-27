import { describe, it, expect } from 'vitest';
import { UserRole } from '@nutri-plus/shared-types';
import { canManageEmployees, canManagePatients, canManageSettings, isWebDashboardRole } from './access';

describe('isWebDashboardRole', () => {
  it('allows nutritionists in the web dashboard', () => {
    expect(isWebDashboardRole(UserRole.NUTRITIONIST)).toBe(true);
  });

  it('blocks patients from the web dashboard', () => {
    expect(isWebDashboardRole(UserRole.PATIENT)).toBe(false);
  });
});

describe('canManagePatients', () => {
  it('allows only nutritionists to create/edit patients', () => {
    expect(canManagePatients(UserRole.NUTRITIONIST)).toBe(true);
    expect(canManagePatients(UserRole.EMPLOYEE)).toBe(false);
    expect(canManagePatients(UserRole.PATIENT)).toBe(false);
  });
});

describe('canManageEmployees', () => {
  it('allows only nutritionists to manage employees', () => {
    expect(canManageEmployees(UserRole.NUTRITIONIST)).toBe(true);
    expect(canManageEmployees(UserRole.EMPLOYEE)).toBe(false);
    expect(canManageEmployees(UserRole.PATIENT)).toBe(false);
  });
});

describe('canManageSettings', () => {
  it('allows only nutritionists', () => {
    expect(canManageSettings(UserRole.NUTRITIONIST)).toBe(true);
    expect(canManageSettings(UserRole.EMPLOYEE)).toBe(false);
    expect(canManageSettings(UserRole.PATIENT)).toBe(false);
  });
});
