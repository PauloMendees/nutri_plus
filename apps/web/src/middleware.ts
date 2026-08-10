import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { decideRedirect } from '@/lib/auth/route-rules';

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const target = decideRedirect(Boolean(user), request.nextUrl.pathname);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = '';
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach(({ name, value, ...options }) =>
      redirectResponse.cookies.set(name, value, options),
    );
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Skip static assets and crawler files so they never hit auth redirects
     * (e.g. /robots.txt must not 307 to /login).
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|brand|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
};
