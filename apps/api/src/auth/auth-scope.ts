import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../generated/prisma/client';
import { AuthContext } from './types/auth-context';

// The NutritionistProfile.id whose data the caller is authorized to act within.
// NUTRITIONIST -> own profile id. EMPLOYEE -> the nutritionist they belong to.
// RolesGuard has already gated the route to the allowed roles; this turns the
// role into a concrete data scope (and is the single seam future configurable
// permissions will build on).
export function resolveScopeNutritionistId(ctx: AuthContext): string {
  const user = ctx.user;
  if (user?.role === UserRole.NUTRITIONIST && user.nutritionistProfile) {
    return user.nutritionistProfile.id;
  }
  if (user?.role === UserRole.EMPLOYEE && user.employeeProfile) {
    return user.employeeProfile.nutritionistId;
  }
  throw new ForbiddenException('Nutritionist scope required');
}
