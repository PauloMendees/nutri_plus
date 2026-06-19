import { ForbiddenException } from '@nestjs/common';
import { resolveScopeNutritionistId } from './auth-scope';
import { AuthContext } from './types/auth-context';

function ctx(user: unknown): AuthContext {
  return { authProviderId: 's', email: 'e@x.com', name: 'n', user: user as any };
}

describe('resolveScopeNutritionistId', () => {
  it('returns the own profile id for a nutritionist', () => {
    expect(
      resolveScopeNutritionistId(
        ctx({ role: 'NUTRITIONIST', nutritionistProfile: { id: 'nut-1' }, employeeProfile: null }),
      ),
    ).toBe('nut-1');
  });

  it('returns the owning nutritionist id for an employee', () => {
    expect(
      resolveScopeNutritionistId(
        ctx({ role: 'EMPLOYEE', nutritionistProfile: null, employeeProfile: { nutritionistId: 'nut-2' } }),
      ),
    ).toBe('nut-2');
  });

  it('throws for a nutritionist with no profile', () => {
    expect(() =>
      resolveScopeNutritionistId(
        ctx({ role: 'NUTRITIONIST', nutritionistProfile: null, employeeProfile: null }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('throws for a patient', () => {
    expect(() =>
      resolveScopeNutritionistId(
        ctx({ role: 'PATIENT', nutritionistProfile: null, patientProfile: { id: 'p' }, employeeProfile: null }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('throws for an unsynced (null) user', () => {
    expect(() => resolveScopeNutritionistId(ctx(null))).toThrow(ForbiddenException);
  });
});
