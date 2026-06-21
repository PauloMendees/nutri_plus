import { describe, it, expect } from 'vitest';
import { decideRedirect } from './route-rules';

describe('decideRedirect', () => {
  it('sends unauthenticated users from a protected route to /login', () => {
    expect(decideRedirect(false, '/')).toBe('/login');
  });

  it('lets unauthenticated users reach public auth routes', () => {
    for (const p of ['/login', '/signup', '/verify-email', '/auth/callback']) {
      expect(decideRedirect(false, p)).toBeNull();
    }
  });

  it('sends authenticated users away from /login and /signup', () => {
    expect(decideRedirect(true, '/login')).toBe('/');
    expect(decideRedirect(true, '/signup')).toBe('/');
  });

  it('lets authenticated users reach protected routes and the callback', () => {
    expect(decideRedirect(true, '/')).toBeNull();
    expect(decideRedirect(true, '/auth/callback')).toBeNull();
    expect(decideRedirect(true, '/verify-email')).toBeNull();
  });
});
