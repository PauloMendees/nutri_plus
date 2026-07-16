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

export interface PatientUserSummary {
  id: string;
  name: string;
  email: string;
}

// Dates are ISO strings over the wire.
export interface PatientSummary {
  id: string;
  user: PatientUserSummary;
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
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientDetail extends PatientSummary {
  assessments: BodyAssessment[];
}

export interface ListPatientsParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CreatePatientRequest {
  name: string;
  email: string;
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
}

export type UpdatePatientRequest = Omit<CreatePatientRequest, 'name' | 'email'> & {
  canLogAssessments?: boolean;
};
