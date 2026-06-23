import { describe, it, expect } from 'vitest';
import { UserRole } from '@nutri-plus/shared-types';
import { isWebDashboardRole } from './access';

describe('isWebDashboardRole', () => {
  it('allows nutritionists in the web dashboard', () => {
    expect(isWebDashboardRole(UserRole.NUTRITIONIST)).toBe(true);
  });

  it('blocks patients from the web dashboard', () => {
    expect(isWebDashboardRole(UserRole.PATIENT)).toBe(false);
  });
});
