import * as jwt from 'jsonwebtoken';

interface SignOptions {
  sub: string;
  email: string;
  name?: string;
}

export function signSupabaseJwt({ sub, email, name }: SignOptions): string {
  // Read at call time (not module load) so it can't be captured before the e2e
  // setup file sets the env.
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error('SUPABASE_JWT_SECRET is not set');
  }
  return jwt.sign(
    {
      sub,
      email,
      user_metadata: name ? { name } : {},
    },
    secret,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}
