import { describe, it, expect } from 'vitest';
import { UserRole, type MeResponse } from '@nutri-plus/shared-types';
import { displayNameOf } from './display-name';

function me(over: Partial<MeResponse> = {}): MeResponse {
  return { id: 'u1', email: 'ana@clinica.com', name: 'Ana Souza', role: UserRole.NUTRITIONIST, ...over };
}

describe('displayNameOf', () => {
  it('prefers the nutritionist display name', () => {
    expect(displayNameOf(me({ nutritionistProfile: { displayName: 'Dra. Ana' } }))).toBe('Dra. Ana');
  });

  it('trims the display name', () => {
    expect(displayNameOf(me({ nutritionistProfile: { displayName: '  Dra. Ana  ' } }))).toBe('Dra. Ana');
  });

  it('falls back to the account name when the display name is empty or blank', () => {
    expect(displayNameOf(me({ nutritionistProfile: { displayName: '' } }))).toBe('Ana Souza');
    expect(displayNameOf(me({ nutritionistProfile: { displayName: '   ' } }))).toBe('Ana Souza');
    expect(displayNameOf(me({ nutritionistProfile: { displayName: null } }))).toBe('Ana Souza');
  });

  it('uses the account name for users without a nutritionist profile (employees)', () => {
    expect(displayNameOf(me({ role: UserRole.EMPLOYEE, nutritionistProfile: null }))).toBe('Ana Souza');
    expect(displayNameOf(me())).toBe('Ana Souza');
  });
});
