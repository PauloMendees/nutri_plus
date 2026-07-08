import { loginSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema } from './auth';

describe('loginSchema', () => {
  it('rejects an invalid email and an empty password', () => {
    const r = loginSchema.safeParse({ email: 'nope', password: '' });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain('Informe um e-mail válido.');
    expect(msgs).toContain('Informe sua senha.');
  });
  it('accepts a valid login', () => {
    expect(loginSchema.safeParse({ email: 'a@x.com', password: 'secret' }).success).toBe(true);
  });
});

describe('forgotPasswordSchema', () => {
  it('rejects an invalid email', () => {
    const r = forgotPasswordSchema.safeParse({ email: 'nope' });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain('Informe um e-mail válido.');
  });
  it('accepts a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@x.com' }).success).toBe(true);
  });
});

describe('resetPasswordSchema', () => {
  const base = { code: '12345678', password: 'password1', confirmPassword: 'password1' };
  it('rejects a code that is not 8 digits', () => {
    const r = resetPasswordSchema.safeParse({ ...base, code: '123456' });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain('Informe o código de 8 dígitos.');
  });
  it('rejects a short password', () => {
    const r = resetPasswordSchema.safeParse({ ...base, password: 'short', confirmPassword: 'short' });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain('A senha deve ter ao menos 8 caracteres.');
  });
  it('rejects mismatched passwords', () => {
    const r = resetPasswordSchema.safeParse({ ...base, confirmPassword: 'password2' });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain('As senhas não coincidem.');
  });
  it('accepts a valid reset', () => {
    expect(resetPasswordSchema.safeParse(base).success).toBe(true);
  });
});

describe('changePasswordSchema', () => {
  const base = { currentPassword: 'old12345', password: 'new12345', confirmPassword: 'new12345' };

  it('accepts a valid change', () => {
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
  });

  it('requires the current password', () => {
    const r = changePasswordSchema.safeParse({ ...base, currentPassword: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Informe sua senha atual.');
  });

  it('requires at least 8 chars for the new password', () => {
    const r = changePasswordSchema.safeParse({ ...base, password: 'short', confirmPassword: 'short' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('A senha deve ter ao menos 8 caracteres.');
  });

  it('rejects a mismatched confirmation', () => {
    const r = changePasswordSchema.safeParse({ ...base, confirmPassword: 'different' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('As senhas não coincidem.');
      expect(r.error.issues[0].path).toEqual(['confirmPassword']);
    }
  });
});
