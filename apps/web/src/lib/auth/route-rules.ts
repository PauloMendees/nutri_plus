/** Routes reachable without an authenticated session. */
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/verify-email',
  '/auth/callback',
  '/forgot-password',
  '/accept-invite',
  '/download-app',
  '/privacy',
  '/suporte',
];

/** Routes an authenticated user should be bounced away from (into the app). */
const AUTH_ONLY_REDIRECT = ['/login', '/signup'];

/** Where authenticated users land when leaving auth/marketing entry points. */
const APP_HOME = '/patients';

function isPublic(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_ROUTES.some((r) => r !== '/' && (pathname === r || pathname.startsWith(`${r}/`)));
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
  if (isAuthenticated && AUTH_ONLY_REDIRECT.includes(pathname)) return APP_HOME;
  // Logged-in users skip the marketing landing and go straight into the app.
  if (isAuthenticated && pathname === '/') return APP_HOME;
  return null;
}
