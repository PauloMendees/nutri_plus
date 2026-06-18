import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  const valid = {
    DATABASE_URL: 'postgresql://postgres:1234@localhost:5432/nutri_plus?schema=public',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    OPENAI_API_KEY: 'sk-test',
  };

  it('returns parsed config for valid env', () => {
    const result = validateEnv(valid);
    expect(result.DATABASE_URL).toBe(valid.DATABASE_URL);
  });

  it('throws when a required var is missing', () => {
    const { SUPABASE_URL, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/SUPABASE_URL/);
  });

  it('throws when DATABASE_URL is not a valid url', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'not-a-url' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });

  it('applies model-tier defaults when the vars are omitted', () => {
    const result = validateEnv(valid);
    expect(result.OPENAI_MODEL_SMART).toBe('gpt-4o');
    expect(result.OPENAI_MODEL_FAST).toBe('gpt-4o-mini');
  });

  it('uses explicit model-tier values when provided', () => {
    const result = validateEnv({ ...valid, OPENAI_MODEL_FAST: 'gpt-5-mini' });
    expect(result.OPENAI_MODEL_FAST).toBe('gpt-5-mini');
  });
});
