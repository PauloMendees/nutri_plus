import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

export const ADMIN_ONLY_KEY = 'adminOnly';

// Rotas do painel de administradores. O AdminGuard roda depois dos guards
// globais (auth → roles → assinatura), já com o AuthContext preenchido.
export const AdminOnly = () => applyDecorators(SetMetadata(ADMIN_ONLY_KEY, true), UseGuards(AdminGuard));
