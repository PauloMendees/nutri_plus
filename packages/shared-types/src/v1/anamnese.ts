export interface PatientAnamnese {
  id: string;
  patientId: string;
  mainComplaint: string | null;
  medications: string | null;
  familyHistory: string | null;
  supplements: string | null;
  sleepHoursPerNight: number | null;
  waterIntakeLiters: number | null;
  alcoholUse: string | null;
  smoking: string | null;
  physicalActivity: string | null;
  bowelHabit: string | null;
  mealsPerDay: number | null;
  eatingHabits: string | null;
  foodPreferences: string | null;
  clinicalNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertAnamneseRequest {
  mainComplaint?: string | null;
  medications?: string | null;
  familyHistory?: string | null;
  supplements?: string | null;
  sleepHoursPerNight?: number | null;
  waterIntakeLiters?: number | null;
  alcoholUse?: string | null;
  smoking?: string | null;
  physicalActivity?: string | null;
  bowelHabit?: string | null;
  mealsPerDay?: number | null;
  eatingHabits?: string | null;
  foodPreferences?: string | null;
  clinicalNotes?: string | null;
}
