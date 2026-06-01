import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthContext, LocalUser } from './types/auth-context';
import { SyncUserDto } from './dto/sync-user.dto';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('sync-user')
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
