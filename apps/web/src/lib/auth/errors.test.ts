import { describe, it, expect } from 'vitest';
import { mapAuthError } from './errors';

describe('mapAuthError', () => {
  it('maps invalid credentials', () => {
    expect(mapAuthError({ code: 'invalid_credentials' })).toMatch(/inválidos/i);
  });
  it('maps unconfirmed email', () => {
    expect(mapAuthError({ code: 'email_not_confirmed' })).toMatch(/confirme/i);
  });
  it('maps already-registered email', () => {
    expect(mapAuthError({ code: 'user_already_exists' })).toMatch(/já existe|já cadastrad/i);
  });
  it('falls back to a generic message', () => {
    expect(mapAuthError({ code: 'something_weird' })).toMatch(/tente novamente/i);
    expect(mapAuthError(null)).toMatch(/tente novamente/i);
  });
});
