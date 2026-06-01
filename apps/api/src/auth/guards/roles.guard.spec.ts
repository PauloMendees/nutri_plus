import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function ctxWith(user: unknown, handlerRoles: UserRole[] | undefined) {
  const reflector = {
    getAllAndOverride: () => handlerRoles,
  } as unknown as Reflector;
  const context = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { guard: new RolesGuard(reflector), context };
}

describe('RolesGuard', () => {
  it('allows when no roles are required', () => {
    const { guard, context } = ctxWith({ user: null }, undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows when local user role is in the required set', () => {
    const { guard, context } = ctxWith(
      { user: { role: UserRole.NUTRITIONIST } },
      [UserRole.NUTRITIONIST],
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies when local user is missing', () => {
    const { guard, context } = ctxWith({ user: null }, [UserRole.NUTRITIONIST]);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('denies when role does not match', () => {
    const { guard, context } = ctxWith(
      { user: { role: UserRole.PATIENT } },
      [UserRole.NUTRITIONIST],
    );
    expect(guard.canActivate(context)).toBe(false);
  });
});
