import { Body, Controller, Delete, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { PushTokensService } from './push-tokens.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

@ApiTags('push-tokens')
@ApiBearerAuth()
@Controller({ path: 'me/push-tokens', version: '1' })
@Roles(UserRole.PATIENT)
export class MePushTokensController {
  constructor(private readonly service: PushTokensService) {}

  @Put()
  register(@CurrentUser() ctx: AuthContext, @Body() dto: RegisterPushTokenDto) {
    return this.service.register(ctx, dto);
  }

  @Delete(':token')
  unregister(@CurrentUser() ctx: AuthContext, @Param('token') token: string) {
    return this.service.unregister(ctx, token);
  }
}
