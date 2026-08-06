import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ChangePlanPreview, ChangePlanResponse, CheckoutResponse, SubscriptionView } from '@nutri-plus/shared-types';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { BillingExempt } from './decorators';
import { SubscriptionService } from './subscription.service';
import { CheckoutDto } from './dto/checkout.dto';
import { PaymentMethodDto } from './dto/payment-method.dto';
import { ChangePlanDto } from './dto/change-plan.dto';

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
  checkout(@CurrentUser() ctx: AuthContext, @Body() dto: CheckoutDto, @Ip() ip: string): Promise<CheckoutResponse> {
    return this.subscription.checkout(resolveScopeNutritionistId(ctx), dto, { name: ctx.name, email: ctx.email }, ip);
  }

  @Post('cancel')
  async cancel(@CurrentUser() ctx: AuthContext): Promise<{ ok: true }> {
    await this.subscription.cancel(resolveScopeNutritionistId(ctx));
    return { ok: true };
  }

  @Post('start-trial')
  async startTrial(@CurrentUser() ctx: AuthContext): Promise<{ ok: true }> {
    await this.subscription.startTrial(resolveScopeNutritionistId(ctx));
    return { ok: true };
  }

  @Post('payment-method')
  async updatePaymentMethod(@CurrentUser() ctx: AuthContext, @Body() dto: PaymentMethodDto, @Ip() ip: string): Promise<{ ok: true }> {
    await this.subscription.updatePaymentMethod(resolveScopeNutritionistId(ctx), dto, { name: ctx.name, email: ctx.email, cpfCnpj: dto.cpfCnpj ?? '' }, ip);
    return { ok: true };
  }

  @Post('change-plan')
  changePlan(@CurrentUser() ctx: AuthContext, @Body() dto: ChangePlanDto): Promise<ChangePlanResponse> {
    return this.subscription.changePlan(resolveScopeNutritionistId(ctx), dto);
  }

  @Post('change-plan/preview')
  previewChangePlan(@CurrentUser() ctx: AuthContext, @Body() dto: ChangePlanDto): Promise<ChangePlanPreview> {
    return this.subscription.previewChangePlan(resolveScopeNutritionistId(ctx), dto);
  }
}
