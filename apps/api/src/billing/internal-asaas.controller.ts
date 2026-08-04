import { Body, Controller, ForbiddenException, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { SubscriptionService, AsaasWebhookEvent } from './subscription.service';

@Controller({ path: 'internal/asaas', version: '1' })
export class InternalAsaasController {
  constructor(
    private readonly subscription: SubscriptionService,
    private readonly config: ConfigService,
  ) {}

  @Post('webhook')
  @Public()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Headers('asaas-access-token') token: string | undefined,
    @Body() event: AsaasWebhookEvent,
  ): Promise<{ ok: true }> {
    const expected = this.config.getOrThrow<string>('ASAAS_WEBHOOK_TOKEN');
    if (!token || token !== expected) {
      throw new ForbiddenException('invalid webhook token');
    }
    await this.subscription.handleWebhook(event);
    return { ok: true };
  }
}
