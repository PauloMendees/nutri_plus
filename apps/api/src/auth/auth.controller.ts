import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthContext, LocalUser } from './types/auth-context';
import { SyncUserDto } from './dto/sync-user.dto';
import { RATE_LIMITS, perMinute } from '../common/rate-limit/rate-limit.policy';

// Login, cadastro e reset de senha são do Supabase (SDK no web e no app).
// A API não tem proxy de senha: ele concentraria tentativas no IP único do
// Render e não tinha chamador nenhum.
@ApiTags('auth')
@ApiBearerAuth()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('sync-user')
  @Throttle(perMinute(RATE_LIMITS.syncUser))
  @HttpCode(HttpStatus.OK)
  syncUser(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: SyncUserDto,
  ): Promise<LocalUser> {
    return this.auth.syncUser(ctx, dto);
  }

  @Get('me')
  me(@CurrentUser() ctx: AuthContext): LocalUser {
    return this.auth.me(ctx);
  }
}
