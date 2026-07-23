import { z } from 'zod';

const emptyToNull = (v: unknown) => (v === '' || v == null ? null : v);
const optText = z.preprocess(emptyToNull, z.string().max(2000).nullable());
const optNum = z.preprocess(emptyToNull, z.coerce.number().min(0).nullable());

export const anamneseSchema = z.object({
  mainComplaint: optText, medications: optText, familyHistory: optText, supplements: optText,
  sleepHoursPerNight: optNum, waterIntakeLiters: optNum,
  alcoholUse: optText, smoking: optText, physicalActivity: optText, bowelHabit: optText,
  mealsPerDay: optNum, eatingHabits: optText, foodPreferences: optText, clinicalNotes: optText,
});
export type AnamneseFormValues = z.infer<typeof anamneseSchema>;
