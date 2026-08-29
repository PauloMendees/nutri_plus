import type { MealPlanDraft } from './meal-plan';

export type AiJobType = 'MEAL_PLAN_GENERATION' | 'MEAL_PLAN_ADJUSTMENT';
export type AiJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

// Um deploy no meio do job o deixa RUNNING para sempre — a API não tem varredura
// corrigindo status. Quem lê decide, com este limiar.
// 35 min: acima do pior caso do SDK da OpenAI (timeout de 10 min x 3 tentativas),
// para que um job ainda vivo nunca seja apresentado como travado — repetir um job
// vivo dispararia execução dupla.
export const AI_JOB_STUCK_AFTER_MS = 35 * 60 * 1000;

export function isAiJobStuck(
  job: { status: AiJobStatus; startedAt: string | null },
  now: Date,
): boolean {
  if (job.status !== 'RUNNING' || job.startedAt === null) return false;
  return now.getTime() - new Date(job.startedAt).getTime() > AI_JOB_STUCK_AFTER_MS;
}

export interface AiJobView {
  id: string;
  type: AiJobType;
  status: AiJobStatus;
  patientId: string;
  // O widget global aparece fora da página do paciente, então precisa dizer de
  // quem é cada processo — sem isso, dois jobs simultâneos ficam indistinguíveis.
  patientName: string;
  mealPlanId: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  // Derivado no servidor com isAiJobStuck, para o front não repetir a regra.
  isStuck: boolean;
}

export interface AiJobDetail extends AiJobView {
  // Só no ajuste; null na geração, que entrega via mealPlanId.
  result: MealPlanDraft | null;
  consumedAt: string | null;
}

export interface CreateAiJobResponse {
  jobId: string;
}
