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
