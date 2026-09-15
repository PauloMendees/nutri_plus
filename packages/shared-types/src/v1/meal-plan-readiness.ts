export type PlanInputKey = 'weight' | 'height' | 'birthDate' | 'gender' | 'objective' | 'activityLevel';

// Rótulos em pt-BR, na ordem em que a nutricionista preenche.
export const PLAN_INPUT_LABELS: Record<PlanInputKey, string> = {
  weight: 'peso (última bioimpedância)',
  height: 'altura',
  birthDate: 'data de nascimento',
  gender: 'sexo',
  objective: 'objetivo',
  activityLevel: 'nível de atividade',
};

export interface PlanInputsSource {
  height: number | null;
  birthDate: string | Date | null;
  gender: string | null;
  objective: string | null;
  activityLevel: string | null;
}

/** O que falta para gerar um plano. Vazio = pode gerar. `latestWeight` é o peso da última bioimpedância. */
export function missingPlanInputs(patient: PlanInputsSource, latestWeight: number | null | undefined): PlanInputKey[] {
  const missing: PlanInputKey[] = [];
  if (latestWeight == null) missing.push('weight');
  if (patient.height == null) missing.push('height');
  if (patient.birthDate == null) missing.push('birthDate');
  if (patient.gender == null) missing.push('gender');
  if (patient.objective == null) missing.push('objective');
  if (patient.activityLevel == null) missing.push('activityLevel');
  return missing;
}

/** Ex.: "Não dá para gerar o plano: falta peso (última bioimpedância), altura e objetivo." */
export function missingPlanInputsMessage(missing: PlanInputKey[]): string {
  const labels = missing.map((k) => PLAN_INPUT_LABELS[k]);
  const list = labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
  return `Não dá para gerar o plano: falta ${list}.`;
}
