import type { PatientInviteStatus } from './patient';

// Painel de administradores (somente leitura). Valores do plano ativo como
// rótulo, derivados da mesma regra de acesso do EntitlementsService.
export type AdminPlanLabel = 'COMP' | 'PRO' | 'ESSENCIAL' | 'TRIAL' | 'TRIAL_ENDED' | 'EXPIRED' | 'NONE';

export const ADMIN_PLAN_LABELS: Record<AdminPlanLabel, string> = {
  COMP: 'Cortesia',
  PRO: 'Pro',
  ESSENCIAL: 'Essencial',
  TRIAL: 'Teste grátis',
  TRIAL_ENDED: 'Teste encerrado',
  EXPIRED: 'Vencida',
  NONE: 'Sem plano',
};

export interface AdminNutritionistRow {
  id: string | null; // NutritionistProfile.id; nulo para quem não confirmou o e-mail
  name: string;
  email: string;
  phone: string | null;
  confirmed: boolean;
  patientCount: number;
  plan: AdminPlanLabel;
  createdAt: string; // ISO
}

export interface AdminPatientRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nutritionistName: string;
  inviteStatus: PatientInviteStatus;
  createdAt: string; // ISO
}

export interface AdminNutritionistFilters {
  search?: string;
  confirmed?: 'yes' | 'no';
  plan?: AdminPlanLabel;
  createdFrom?: string; // YYYY-MM-DD (São Paulo)
  createdTo?: string; // YYYY-MM-DD (São Paulo), inclusivo
}

export interface AdminNutritionistDetail {
  nutritionist: AdminNutritionistRow;
  patients: AdminPatientRow[];
}
