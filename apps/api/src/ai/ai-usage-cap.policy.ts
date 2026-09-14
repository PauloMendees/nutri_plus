// Teto diário de IA (ver CONTEXT.md): rede de segurança abaixo das cotas
// mensais de plano. Conta sucesso e falha do dia em America/Sao_Paulo.
export const AI_DAILY_CAPS = {
  nutritionist: 60, // todos os tipos, por nutricionista
  patient: 10, // OUTSIDE_HOME_SUGGESTION, por paciente
} as const;

export const AI_DAILY_CAP_MESSAGE = 'Limite diário de IA atingido. Tente amanhã.';
