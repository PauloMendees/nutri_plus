import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';

// Fora do rate limit: o health check do Render nunca pode ser bloqueado.
// @SkipThrottle() sem argumento só pula o throttler 'default' — nomeamos os
// dois nossos ('global' e 'route'), então precisam ser listados explicitamente.
@SkipThrottle({ global: true, route: true })
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok' };
  }
}
