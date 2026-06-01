// The value stored in User.authProvider for Supabase-issued identities.
// Shared by the JWT strategy (lookup) and UsersService (create/lookup) so the
// literal never drifts between write and read paths.
export const SUPABASE_PROVIDER = 'SUPABASE';
