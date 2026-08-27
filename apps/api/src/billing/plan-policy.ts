import { PLAN_CATALOG, type Entitlements, type PlanFeature, type PlanTier } from '@nutri-plus/shared-types';

export const TRIAL_DAYS = 7;
export const COURTESY_DAYS = 30;

// Início do mês em America/Sao_Paulo (UTC-3, sem DST) expresso em instante UTC.
export function saoPauloMonthStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value); // 1-12
  // 00:00 em São Paulo == 03:00 UTC.
  return new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
}

/**
 * O trial pode ser iniciado a qualquer momento, desde que a pessoa ainda não o
 * tenha usado E não seja nem tenha sido assinante.
 *
 * Deliberadamente NÃO olha `onboardedAt`: aquele campo significa "passou pelo
 * gate de onboarding" e é marcado pelo checkout ANTES do pagamento, então
 * gerar um QR de Pix e desistir queimava o trial para sempre — deixando a conta
 * em read-only sem saída, já que o resolveAccess exige `trialEndsAt`.
 *
 * Fonte única da regra: usada tanto para exibir o botão (canStartTrial na view)
 * quanto para autorizar o POST /me/subscription/start-trial.
 */
export function isTrialEligible(sub: {
  isComp?: boolean | null;
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  paymentCount?: number | null;
}): boolean {
  // `!= null` de propósito: campo ausente/undefined significa "não tem", não
  // "já usou". O erro na direção oposta tranca a conta em read-only, que é
  // justamente o bug que esta regra existe para corrigir.
  if (sub.isComp) return false; // cortesia já tem PRO
  if (sub.trialEndsAt != null) return false; // já usou
  if (sub.currentPeriodEnd != null) return false; // é ou foi assinante
  return (sub.paymentCount ?? 0) === 0; // nunca pagou nada
}

export function entitlementsForTier(tier: PlanTier, aiUsed: number): Omit<Entitlements, 'isReadOnly'> {
  const cfg = PLAN_CATALOG[tier];
  const has = (f: PlanFeature) => cfg.features.includes(f);
  return {
    tier,
    features: { silhueta: has('silhueta'), transcription: has('transcription'), employees: has('employees') },
    aiQuota: cfg.aiActionsPerMonth,
    aiUsed,
  };
}
