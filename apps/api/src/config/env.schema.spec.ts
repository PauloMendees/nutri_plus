import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  const valid = {
    DATABASE_URL: 'postgresql://postgres:1234@localhost:5432/nutri_plus?schema=public',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_JWT_SECRET: 'secret',
    OPENAI_API_KEY: 'sk-test',
  };

  it('returns parsed config for valid env', () => {
    const result = validateEnv(valid);
    expect(result.DATABASE_URL).toBe(valid.DATABASE_URL);
  });

  it('throws when a required var is missing', () => {
    const { SUPABASE_JWT_SECRET, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/SUPABASE_JWT_SECRET/);
  });

  it('throws when DATABASE_URL is not a valid url', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'not-a-url' })).toThrow();
  });
});
