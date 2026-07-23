import type { ActivityLevel, Gender, PatientObjective } from './patient';
import type { BodyAssessment } from './assessment';
import type { MealPlan } from './meal-plan';
import type { NutritionTarget } from './nutrition-target';
import type { SilhuetaScan } from './silhueta';
import type { Appointment } from './appointment';
import type { PatientConsent } from './consent';

export interface MyDataExportProfile {
  name: string;
  email: string;
  birthDate: string | null;
  gender: Gender | null;
  height: number | null;
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
  createdAt: string;
  updatedAt: string;
}

// The patient's full data (LGPD access/portability). Dates are ISO strings over
// the wire. Photos are referenced by URL (profile photoUrl); silhueta scans store
// no images.
export interface MyDataExport {
  exportedAt: string;
  profile: MyDataExportProfile;
  assessments: BodyAssessment[];
  mealPlans: MealPlan[];
  nutritionTargets: NutritionTarget[];
  silhuetaScans: SilhuetaScan[];
  appointments: Appointment[];
  consents: PatientConsent[];
}
