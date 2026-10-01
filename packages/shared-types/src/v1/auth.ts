import { UserRole } from './user-role';

export interface SyncUserRequest {
  role: UserRole;
  referralCode?: string;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  nutritionist?: { id: string; referralCode: string; crn: string | null };
  // /auth/me devolve o LocalUser inteiro; só o que o web lê está tipado aqui.
  nutritionistProfile?: { displayName: string | null } | null;
  patient?: { id: string; nutritionistId: string | null };
  // Painel de administradores: true só para e-mails em ADMIN_EMAILS (API).
  isAdmin?: boolean;
}
