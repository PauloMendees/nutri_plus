// Dates are ISO strings over the wire. Metrics are nullable estimates.
export interface SilhuetaScan {
  id: string;
  patientId: string;
  scanDate: string;
  heightCm: number | null;
  weightKg: number | null;
  waistInput: number | null;
  hipInput: number | null;
  bodyFatPercentage: number | null;
  muscleMassPercentage: number | null;
  leanMassPercentage: number | null;
  fatMass: number | null;
  waistCircumference: number | null;
  hipCircumference: number | null;
  chestCircumference: number | null;
  armCircumference: number | null;
  thighCircumference: number | null;
  abdomenCircumference: number | null;
  contractedArmCircumference: number | null;
  calfCircumference: number | null;
  consentAcceptedAt: string;
  createdAt: string;
}

export interface CreateSilhuetaScanRequest {
  heightCm?: number;
  weightKg?: number;
  waistInput?: number;
  hipInput?: number;
  consent: boolean;
}
