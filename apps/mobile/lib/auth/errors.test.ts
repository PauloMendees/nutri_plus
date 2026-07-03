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

describe('mapAuthError — reset/OTP', () => {
  it('maps Supabase error codes to pt-BR messages', () => {
    expect(mapAuthError({ code: 'otp_expired' })).toBe('Código inválido ou expirado. Peça um novo.');
    expect(mapAuthError({ code: 'weak_password' })).toBe('A senha é muito fraca. Use ao menos 8 caracteres.');
    expect(mapAuthError({ code: 'same_password' })).toBe('A nova senha deve ser diferente da atual.');
    expect(mapAuthError({ code: 'over_email_send_rate_limit' })).toBe(
      'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    );
  });
  it('maps an invalid/expired OTP by message when there is no code', () => {
    expect(mapAuthError({ message: 'Token has expired or is invalid' })).toBe(
      'Código inválido ou expirado. Peça um novo.',
    );
  });
  it('prefers code over message', () => {
    expect(mapAuthError({ code: 'invalid_credentials', message: 'whatever' })).toBe('E-mail ou senha inválidos.');
  });
});
