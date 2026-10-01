import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminGuard } from './admin.guard';

function contextFor(user: unknown) {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('AdminGuard', () => {
  const config = (value?: string) => ({ get: () => value }) as any;
  const reflector = { getAllAndOverride: () => true } as unknown as Reflector;

  it('lets an allowlisted user through', () => {
    const guard = new AdminGuard(reflector, config('admin@x.com'));
    expect(guard.canActivate(contextFor({ email: 'x', user: { email: 'Admin@x.com' } }))).toBe(true);
  });

  it('answers 404 to a logged-in user who is not an admin', () => {
    const guard = new AdminGuard(reflector, config('admin@x.com'));
    expect(() => guard.canActivate(contextFor({ email: 'n@x.com', user: { email: 'n@x.com' } }))).toThrow(
      NotFoundException,
    );
  });

  it('answers 404 when no admin is configured', () => {
    const guard = new AdminGuard(reflector, config(undefined));
    expect(() => guard.canActivate(contextFor({ email: 'admin@x.com', user: { email: 'admin@x.com' } }))).toThrow(
      NotFoundException,
    );
  });

  it('answers 404 without a local user', () => {
    const guard = new AdminGuard(reflector, config('admin@x.com'));
    expect(() => guard.canActivate(contextFor({ email: 'admin@x.com', user: null }))).toThrow(NotFoundException);
  });

  it('does nothing on routes without @AdminOnly', () => {
    const notAdminRoute = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new AdminGuard(notAdminRoute, config(undefined));
    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });
});
