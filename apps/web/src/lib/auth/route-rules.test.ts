import { describe, it, expect } from 'vitest';
import { decideRedirect } from './route-rules';

describe('decideRedirect', () => {
  it('lets unauthenticated users reach the marketing landing at /', () => {
    expect(decideRedirect(false, '/')).toBeNull();
  });

  it('sends unauthenticated users from a protected route to /login', () => {
    expect(decideRedirect(false, '/patients')).toBe('/login');
  });

  it('lets unauthenticated users reach public auth routes', () => {
    for (const p of ['/login', '/signup', '/verify-email', '/auth/callback']) {
      expect(decideRedirect(false, p)).toBeNull();
    }
  });

  it('sends authenticated users away from /login and /signup into the app', () => {
    expect(decideRedirect(true, '/login')).toBe('/patients');
    expect(decideRedirect(true, '/signup')).toBe('/patients');
  });

  it('sends authenticated users from the landing into the app', () => {
    expect(decideRedirect(true, '/')).toBe('/patients');
  });

  it('lets authenticated users reach protected routes and the callback', () => {
    expect(decideRedirect(true, '/patients')).toBeNull();
    expect(decideRedirect(true, '/auth/callback')).toBeNull();
    expect(decideRedirect(true, '/verify-email')).toBeNull();
  });

  it('lets unauthenticated users reach /forgot-password', () => {
    expect(decideRedirect(false, '/forgot-password')).toBeNull();
  });

  it('requires a session for /reset-password (unauthenticated → /login)', () => {
    expect(decideRedirect(false, '/reset-password')).toBe('/login');
  });

  it('lets unauthenticated users reach the patient onboarding routes', () => {
    expect(decideRedirect(false, '/accept-invite')).toBeNull();
    expect(decideRedirect(false, '/download-app')).toBeNull();
  });

  it('lets anyone reach the public info pages (privacy, support)', () => {
    for (const p of ['/privacy', '/suporte']) {
      expect(decideRedirect(false, p)).toBeNull();
      expect(decideRedirect(true, p)).toBeNull();
    }
  });
});
