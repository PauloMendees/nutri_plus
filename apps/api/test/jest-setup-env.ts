// Provides benign default env vars for UNIT tests so that instantiating
// AppModule (which runs fail-fast env validation at boot) does not require the
// developer to export real secrets. Uses ??= so it never clobbers values that
// are already set (e.g. a real .env or CI secrets).
process.env.DATABASE_URL ??=
  'postgresql://postgres:1234@localhost:5432/nutri_plus?schema=public';
process.env.SUPABASE_URL ??= 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY ??= 'test-anon';
process.env.SUPABASE_JWT_SECRET ??= 'test-jwt-secret';
process.env.OPENAI_API_KEY ??= 'sk-test';
