import type { ActivityLevel, Gender, PatientObjective } from './patient';
import type { BodyAssessment } from './assessment';
import type { MealPlan } from './meal-plan';
import type { NutritionTarget } from './nutrition-target';
import type { SilhuetaScan } from './silhueta';
import type { Appointment } from './appointment';
import type { PatientConsent } from './consent';
import type { PatientAnamnese } from './anamnese';
import type { FoodRecall } from './food-recall';
import type { ConsultationTranscript } from './consultation-audio';
import type { MealLog } from './meal-log';

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

// Pedido de sugestão "comendo fora de casa" feito no app, com a resposta da IA.
export interface OutsideHomeRequestExport {
  id: string;
  message: string;
  aiSuggestion: string;
  createdAt: string;
}

// The patient's full data (LGPD access/portability). Dates are ISO strings over
// the wire. Photos are referenced by URL (profile photoUrl — omitted from the copy
// e-mailed on deletion, since the purge removes the file); silhueta scans store
// no images; consultation audio files are not exported, only DONE transcripts.
export interface MyDataExport {
  exportedAt: string;
  profile: MyDataExportProfile;
  anamnese: PatientAnamnese | null;
  assessments: BodyAssessment[];
  mealPlans: MealPlan[];
  foodRecalls: FoodRecall[];
  nutritionTargets: NutritionTarget[];
  silhuetaScans: SilhuetaScan[];
  appointments: Appointment[];
  consents: PatientConsent[];
  consultationTranscripts: ConsultationTranscript[];
  outsideHomeRequests: OutsideHomeRequestExport[];
  mealLogs: MealLog[];
}
