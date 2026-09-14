import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';

// Fora do rate limit: o health check do Render nunca pode ser bloqueado.
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok' };
  }
}
