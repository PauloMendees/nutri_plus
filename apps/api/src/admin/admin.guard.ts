import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthContext } from '../auth/types/auth-context';
import { isAdminEmail } from './admin-access';

const ADMIN_ONLY_KEY = 'adminOnly';

// 404 (e não 403) para quem está logado mas não é admin: não revela que o
// painel existe. Sem login, o SupabaseAuthGuard global já respondeu 401.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const adminOnly = this.reflector.getAllAndOverride<boolean | undefined>(ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!adminOnly) return true;
    const ctx: AuthContext | undefined = context.switchToHttp().getRequest().user;
    if (!ctx?.user || !isAdminEmail(ctx.user.email ?? ctx.email, this.config.get<string>('ADMIN_EMAILS'))) {
      throw new NotFoundException();
    }
    return true;
  }
}
