import type { BodyAssessment } from './assessment';

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY',
}

export enum PatientObjective {
  WEIGHT_LOSS = 'WEIGHT_LOSS',
  MUSCLE_GAIN = 'MUSCLE_GAIN',
  MAINTENANCE = 'MAINTENANCE',
  RECOMPOSITION = 'RECOMPOSITION',
}

export enum ActivityLevel {
  SEDENTARY = 'SEDENTARY',
  LIGHT = 'LIGHT',
  MODERATE = 'MODERATE',
  ACTIVE = 'ACTIVE',
  VERY_ACTIVE = 'VERY_ACTIVE',
}

export type PatientInviteStatus = 'NOT_INVITED' | 'INVITED' | 'ACTIVE';

export interface PatientUserRef {
  id: string;
}

// Dates are ISO strings over the wire.
export interface PatientSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  inviteStatus: PatientInviteStatus;
  user: PatientUserRef | null;
  nutritionistId: string | null;
  birthDate: string | null;
  gender: Gender | null;
  height: number | null;
  imc: number | null;
  targetWeight: number | null;
  objective: PatientObjective | null;
  activityLevel: ActivityLevel | null;
  restrictions: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  notes: string | null;
  canLogAssessments: boolean;
  showMealTargetToPatient: boolean;
  photoUrl: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PatientDetail extends PatientSummary {
  assessments: BodyAssessment[];
  latestConsent: { policyVersion: string; acceptedAt: string } | null;
}

export interface ListPatientsParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CreatePatientRequest {
  name: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  gender?: Gender;
  height?: number;
  targetWeight?: number;
  objective?: PatientObjective;
  activityLevel?: ActivityLevel;
  restrictions?: string;
  allergies?: string;
  medicalConditions?: string;
  notes?: string;
  demo?: boolean;
}

export type UpdatePatientRequest = Partial<Omit<CreatePatientRequest, 'demo'>> & {
  canLogAssessments?: boolean;
  showMealTargetToPatient?: boolean;
};

export interface ImportPreviewResponse {
  headers: string[];
  suggestedMapping: Record<string, string>;
  mappedBy: Record<string, 'template' | 'alias' | 'ai' | 'unmapped'>;
  rowCount: number;
  previewRows: { line: number; values: Record<string, string> }[];
}

export interface ImportCommitResponse {
  created: number;
  skipped: number;
  errors: { line: number; name: string | null; message: string }[];
}

/** Catalog destinations for the import mapping select (keys + labels only). */
export const IMPORT_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: 'name', label: 'Nome' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefone' },
  { key: 'birthDate', label: 'Data de nascimento' },
  { key: 'gender', label: 'Sexo' },
  { key: 'height', label: 'Altura (cm)' },
  { key: 'targetWeight', label: 'Peso alvo (kg)' },
  { key: 'objective', label: 'Objetivo' },
  { key: 'activityLevel', label: 'Nível de atividade' },
  { key: 'restrictions', label: 'Restrições' },
  { key: 'allergies', label: 'Alergias' },
  { key: 'medicalConditions', label: 'Condições médicas' },
  { key: 'notes', label: 'Observações' },
  { key: 'assessment.assessmentDate', label: 'Data da avaliação' },
  { key: 'assessment.weight', label: 'Peso (kg)' },
  { key: 'assessment.bodyFatPercentage', label: 'Gordura (%)' },
  { key: 'assessment.muscleMass', label: 'Massa muscular (kg)' },
  { key: 'assessment.leanMass', label: 'Massa magra (kg)' },
  { key: 'assessment.muscleMassPercentage', label: 'Massa muscular (%)' },
  { key: 'assessment.leanMassPercentage', label: 'Massa magra (%)' },
  { key: 'assessment.visceralFat', label: 'Gordura visceral' },
  { key: 'assessment.basalMetabolicRate', label: 'TMB' },
  { key: 'assessment.bodyWaterPercentage', label: 'Água corporal (%)' },
  { key: 'assessment.boneMass', label: 'Massa óssea (kg)' },
  { key: 'assessment.metabolicAge', label: 'Idade metabólica' },
  { key: 'assessment.waistCircumference', label: 'Cintura (cm)' },
  { key: 'assessment.hipCircumference', label: 'Quadril (cm)' },
  { key: 'assessment.chestCircumference', label: 'Tórax (cm)' },
  { key: 'assessment.armCircumference', label: 'Braço (cm)' },
  { key: 'assessment.thighCircumference', label: 'Coxa (cm)' },
  { key: 'assessment.abdomenCircumference', label: 'Abdômen (cm)' },
  { key: 'assessment.contractedArmCircumference', label: 'Braço contraído (cm)' },
  { key: 'assessment.calfCircumference', label: 'Panturrilha (cm)' },
  { key: 'assessment.notes', label: 'Notas da avaliação' },
  { key: 'anamnese.mainComplaint', label: 'Queixa principal' },
  { key: 'anamnese.medications', label: 'Medicações' },
  { key: 'anamnese.familyHistory', label: 'Histórico familiar' },
  { key: 'anamnese.supplements', label: 'Suplementos' },
  { key: 'anamnese.sleepHoursPerNight', label: 'Horas de sono' },
  { key: 'anamnese.waterIntakeLiters', label: 'Água (L)' },
  { key: 'anamnese.alcoholUse', label: 'Álcool' },
  { key: 'anamnese.smoking', label: 'Tabagismo' },
  { key: 'anamnese.physicalActivity', label: 'Atividade física (anamnese)' },
  { key: 'anamnese.bowelHabit', label: 'Hábito intestinal' },
  { key: 'anamnese.mealsPerDay', label: 'Refeições por dia' },
  { key: 'anamnese.eatingHabits', label: 'Hábitos alimentares' },
  { key: 'anamnese.foodPreferences', label: 'Preferências alimentares' },
  { key: 'anamnese.clinicalNotes', label: 'Notas clínicas' },
  { key: 'ignore', label: 'Ignorar' },
];
