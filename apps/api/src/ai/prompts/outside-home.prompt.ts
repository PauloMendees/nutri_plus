// Pure prompt builder for the "fora de casa" (outside-home) AI assistant. No DI,
// no SDK. The consumer (outside-home feature) imports these; types are declared
// locally to avoid a cross-module dependency cycle.

export interface OutsideHomePromptContext {
  objective: string | null;
  restrictions: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  patientNotes: string | null;
  currentPlanSummary: string | null; // compact text of the latest visible plan, or null
  message: string;
}

export const OUTSIDE_HOME_SYSTEM_PROMPT = [
  'Você é um assistente de nutrição prático para quando o paciente está fora de casa.',
  'Dada a situação do paciente, sugira o que comer de forma CONCISA e ACIONÁVEL.',
  'Alinhe a sugestão ao objetivo, restrições, alergias e ao plano alimentar atual quando houver.',
  'NÃO faça alegações médicas nem diagnósticos. Não invente valores nutricionais exatos.',
  'Responda em português do Brasil, em poucas frases.',
].join(' ');

// The user prompt is the structured context as JSON. The provider sends it
// verbatim; never include free-form instructions here.
export function buildOutsideHomeUserPrompt(ctx: OutsideHomePromptContext): string {
  return JSON.stringify(ctx);
}
