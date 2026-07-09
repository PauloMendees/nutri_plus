/** Routes reachable without an authenticated session. */
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/verify-email',
  '/auth/callback',
  '/forgot-password',
  '/accept-invite',
  '/download-app',
  '/privacy',
];

/** Routes an authenticated user should be bounced away from (back to the app). */
const AUTH_ONLY_REDIRECT = ['/login', '/signup'];

function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * Decide where middleware should redirect, or null to pass through.
 * Pure function — unit-tested in isolation from Next/Supabase.
 */
export function decideRedirect(
  isAuthenticated: boolean,
  pathname: string,
): string | null {
  if (!isAuthenticated && !isPublic(pathname)) return '/login';
  if (isAuthenticated && AUTH_ONLY_REDIRECT.includes(pathname)) return '/';
  return null;
}
