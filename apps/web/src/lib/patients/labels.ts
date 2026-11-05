import {
  ActivityLevel,
  Gender,
  PATIENT_OBJECTIVE_LABELS,
  PatientInviteStatus,
} from '@nutri-plus/shared-types';

export const OBJECTIVE_LABELS = PATIENT_OBJECTIVE_LABELS;

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

export const INVITE_STATUS_LABELS: Record<PatientInviteStatus, string> = {
  NOT_INVITED: 'Sem convite',
  INVITED: 'Convite enviado',
  ACTIVE: 'Ativo',
};
