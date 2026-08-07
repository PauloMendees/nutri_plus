import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { CheckoutResponse, SubscriptionView } from '@nutri-plus/shared-types';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { BillingExempt } from './decorators';
import { SubscriptionService } from './subscription.service';
import { CheckoutDto } from './dto/checkout.dto';

@ApiTags('subscription')
@ApiBearerAuth()
@Controller({ path: 'me/subscription', version: '1' })
@Roles(UserRole.NUTRITIONIST)
@BillingExempt() // as próprias rotas de billing nunca podem ser bloqueadas pelo guard
export class MeSubscriptionController {
  constructor(private readonly subscription: SubscriptionService) {}

  @Get()
  getView(@CurrentUser() ctx: AuthContext): Promise<SubscriptionView> {
    return this.subscription.getView(resolveScopeNutritionistId(ctx));
  }

  @Post('checkout')
  checkout(@CurrentUser() ctx: AuthContext, @Body() dto: CheckoutDto): Promise<CheckoutResponse> {
    return this.subscription.checkout(resolveScopeNutritionistId(ctx), dto, {
      name: ctx.name, email: ctx.email,
    });
  }

  @Post('cancel')
  async cancel(@CurrentUser() ctx: AuthContext): Promise<{ ok: true }> {
    await this.subscription.cancel(resolveScopeNutritionistId(ctx));
    return { ok: true };
  }
}
