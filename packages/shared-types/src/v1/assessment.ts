// Dates are ISO strings over the wire. All metrics are nullable in storage.
export interface BodyAssessment {
  id: string;
  patientId: string;
  assessmentDate: string;
  weight: number | null;
  bodyFatPercentage: number | null;
  muscleMass: number | null;
  leanMass: number | null;
  visceralFat: number | null;
  basalMetabolicRate: number | null;
  bodyWaterPercentage: number | null;
  boneMass: number | null;
  metabolicAge: number | null;
  waistCircumference: number | null;
  hipCircumference: number | null;
  chestCircumference: number | null;
  armCircumference: number | null;
  thighCircumference: number | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateAssessmentRequest {
  assessmentDate?: string;
  weight?: number;
  bodyFatPercentage?: number;
  muscleMass?: number;
  leanMass?: number;
  visceralFat?: number;
  basalMetabolicRate?: number;
  bodyWaterPercentage?: number;
  boneMass?: number;
  metabolicAge?: number;
  waistCircumference?: number;
  hipCircumference?: number;
  chestCircumference?: number;
  armCircumference?: number;
  thighCircumference?: number;
  notes?: string;
}

export type UpdateAssessmentRequest = CreateAssessmentRequest;

// Response of GET /v1/me/assessments — the caller's own evolution.
export interface MyEvolutionResponse {
  name: string;
  height: number | null;
  assessments: BodyAssessment[];
  canLog: boolean;
}
