import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthContext, LocalUser } from './types/auth-context';
import { SyncUserDto } from './dto/sync-user.dto';
import { LoginDto, LoginResponse } from './dto/login.dto';

@ApiTags('auth')
@ApiBearerAuth()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.auth.login(dto);
  }

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
