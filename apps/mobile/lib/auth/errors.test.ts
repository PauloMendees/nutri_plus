import { mapAuthError } from './errors';

describe('mapAuthError', () => {
  it('maps invalid credentials to a friendly pt-BR message', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' })).toBe('E-mail ou senha inválidos.');
  });
  it('falls back to a generic message', () => {
    expect(mapAuthError({ message: 'network boom' })).toBe('Algo deu errado. Tente novamente.');
    expect(mapAuthError(null)).toBe('Algo deu errado. Tente novamente.');
  });
});
