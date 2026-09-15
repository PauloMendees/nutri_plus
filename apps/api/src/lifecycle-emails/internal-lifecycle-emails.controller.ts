import { Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { LifecycleEmailsService } from './lifecycle-emails.service';

@ApiTags('lifecycle-emails')
@Controller({ path: 'internal/lifecycle-emails', version: '1' })
export class InternalLifecycleEmailsController {
  constructor(
    private readonly lifecycleEmails: LifecycleEmailsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @ApiExcludeEndpoint()
  @Post('dispatch')
  async dispatch(@Headers('x-reminder-key') key?: string) {
    // Reusa o segredo dos lembretes de consulta (REMINDER_DISPATCH_KEY) em vez
    // de criar uma variável nova só para este endpoint.
    const expected = this.config.get<string>('REMINDER_DISPATCH_KEY');
    // Fail-closed: sem segredo configurado, a rota nunca abre.
    if (!expected || key !== expected) {
      throw new UnauthorizedException();
    }
    return this.lifecycleEmails.dispatch();
  }
}
