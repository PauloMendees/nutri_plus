import { loginSchema } from './auth';

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
