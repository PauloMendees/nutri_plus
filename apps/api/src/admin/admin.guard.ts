import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthContext } from '../auth/types/auth-context';
import { isAdminEmail } from './admin-access';

// 404 (e não 403) para quem está logado mas não é admin: não revela que o
// painel existe. Só roda via @AdminOnly() e sempre confere (falha fechada).
// Sem login, o SupabaseAuthGuard global já respondeu 401.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const ctx: AuthContext | undefined = context.switchToHttp().getRequest().user;
    if (!ctx?.user || !isAdminEmail(ctx.user.email ?? ctx.email, this.config.get<string>('ADMIN_EMAILS'))) {
      throw new NotFoundException();
    }
    return true;
  }
}
