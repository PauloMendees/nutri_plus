import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);
const optText = z.preprocess(emptyToUndefined, z.string().max(2000).optional());
const optNum = z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional());

export const anamneseSchema = z.object({
  mainComplaint: optText, medications: optText, familyHistory: optText, supplements: optText,
  sleepHoursPerNight: optNum, waterIntakeLiters: optNum,
  alcoholUse: optText, smoking: optText, physicalActivity: optText, bowelHabit: optText,
  mealsPerDay: optNum, eatingHabits: optText, foodPreferences: optText, clinicalNotes: optText,
});
export type AnamneseFormValues = z.infer<typeof anamneseSchema>;
