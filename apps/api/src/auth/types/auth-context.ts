import { NutritionistProfile, PatientProfile, User } from '@prisma/client';

export type LocalUser = User & {
  nutritionistProfile: NutritionistProfile | null;
  patientProfile: PatientProfile | null;
};

export interface AuthContext {
  authProviderId: string;
  email: string;
  name: string;
  user: LocalUser | null;
}
