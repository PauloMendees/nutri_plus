import { ActivityLevel, Gender, PatientObjective } from '@nutri-plus/shared-types';

export const OBJECTIVE_LABELS: Record<PatientObjective, string> = {
  [PatientObjective.WEIGHT_LOSS]: 'Perda de peso',
  [PatientObjective.MUSCLE_GAIN]: 'Ganho de massa',
  [PatientObjective.MAINTENANCE]: 'Manutenção',
  [PatientObjective.RECOMPOSITION]: 'Recomposição',
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  [ActivityLevel.SEDENTARY]: 'Sedentário',
  [ActivityLevel.LIGHT]: 'Leve',
  [ActivityLevel.MODERATE]: 'Moderado',
  [ActivityLevel.ACTIVE]: 'Ativo',
  [ActivityLevel.VERY_ACTIVE]: 'Muito ativo',
};

export const GENDER_LABELS: Record<Gender, string> = {
  [Gender.MALE]: 'Masculino',
  [Gender.FEMALE]: 'Feminino',
  [Gender.OTHER]: 'Outro',
  [Gender.PREFER_NOT_TO_SAY]: 'Prefiro não informar',
};
