import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController } from '@nestjs/swagger';
import type { MetaSignalResponse } from '@nutri-plus/shared-types';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { BillingExempt } from '../billing/decorators';
import { MetaCtx, type MetaContext } from './meta-context';
import { MetaSignalDto } from './dto/meta-signal.dto';
import { MetaSignalsService } from './meta-signals.service';

/**
 * Relay autenticado. O e-mail do `user_data` vem da sessão, nunca do corpo, e
 * o valor de `Subscribe` é lido da assinatura no banco.
 *
 * `@BillingExempt` porque telemetria não pode ser barrada pelo guard de
 * assinatura — um nutricionista em read-only ainda gera eventos de conversão
 * (é exatamente ele que a campanha quer reconquistar).
 */
@Controller({ path: 'me/signals', version: '1' })
@ApiBearerAuth()
@ApiExcludeController()
@Roles(UserRole.NUTRITIONIST)
@BillingExempt()
export class MeMetaSignalsController {
  constructor(private readonly signals: MetaSignalsService) {}

  @Post()
  @HttpCode(202)
  track(
    @CurrentUser() auth: AuthContext,
    @Body() dto: MetaSignalDto,
    @MetaCtx() ctx: MetaContext,
  ): Promise<MetaSignalResponse> {
    return this.signals
      .authenticated(
        {
          nutritionistId: resolveScopeNutritionistId(auth),
          email: auth.email ?? auth.user?.email ?? null,
          dto,
        },
        ctx,
      )
      .then((fired) => ({ fired }));
  }
}
