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
  patient?: { id: string; nutritionistId: string | null };
}
