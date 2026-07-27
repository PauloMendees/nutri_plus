import { Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { RemindersService } from './reminders.service';

@ApiTags('reminders')
@Controller({ path: 'internal/reminders', version: '1' })
export class InternalRemindersController {
  constructor(
    private readonly reminders: RemindersService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('dispatch')
  async dispatch(@Headers('x-reminder-key') key?: string) {
    const expected = this.config.get<string>('REMINDER_DISPATCH_KEY');
    // Fail-closed: sem segredo configurado, a rota nunca abre.
    if (!expected || key !== expected) {
      throw new UnauthorizedException();
    }
    return this.reminders.dispatch();
  }
}
