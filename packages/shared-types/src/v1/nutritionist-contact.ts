// Basic, patient-facing view of the patient's nutritionist (GET /me/nutritionist).
export interface NutritionistContact {
  name: string;
  displayName: string | null;
  email: string;
  crn: string | null;
  logoUrl: string | null;
}
