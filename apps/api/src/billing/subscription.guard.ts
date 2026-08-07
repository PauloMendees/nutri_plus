import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlanFeature } from '@nutri-plus/shared-types';
import { UserRole } from '../generated/prisma/client';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { EntitlementsService } from './entitlements.service';
import { PaymentRequiredException } from './payment-required.exception';
import { BILLING_EXEMPT_KEY, REQUIRES_FEATURE_KEY } from './decorators';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(BILLING_EXEMPT_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest();
    const authCtx: AuthContext = req.user;
    const role = authCtx?.user?.role;

    // Pacientes são grátis; billing só governa o tenant do nutricionista.
    if (role !== UserRole.NUTRITIONIST && role !== UserRole.EMPLOYEE) return true;

    const feature = this.reflector.getAllAndOverride<PlanFeature | undefined>(REQUIRES_FEATURE_KEY, targets);
    const isWrite = !READ_METHODS.has(req.method);

    // Leituras sem exigência de feature passam mesmo em read-only.
    if (!isWrite && !feature) return true;

    const nutritionistId = resolveScopeNutritionistId(authCtx);
    const ent = await this.entitlements.getEntitlements(nutritionistId);

    if (feature && !ent.features[feature]) {
      throw new PaymentRequiredException('FEATURE_PRO_ONLY', feature);
    }
    if (isWrite && ent.isReadOnly) {
      throw new PaymentRequiredException('READ_ONLY');
    }
    return true;
  }
}
