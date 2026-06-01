export interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  user_metadata?: {
    name?: string;
    full_name?: string;
  };
  // Standard JWT claims present on every Supabase token (validated by
  // passport-jwt for expiry; declared here for accurate typing).
  iat?: number;
  exp?: number;
  aud?: string;
  iss?: string;
}
