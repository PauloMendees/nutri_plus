import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const optText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().max(max, `Máximo de ${max} caracteres.`).optional());

const optNum = z.preprocess(
  emptyToUndefined,
  z.coerce.number().min(0, 'Não pode ser negativo.').optional(),
);

const mealItemSchema = z.object({
  foodName: optText(200),
  quantity: optText(100),
  calories: optNum,
  protein: optNum,
  carbs: optNum,
  fats: optNum,
});

const mealOptionSchema = z.object({
  label: optText(200),
  items: z.array(mealItemSchema),
});

const mealSchema = z.object({
  name: optText(200),
  timeLabel: optText(100),
  instructions: optText(2000),
  options: z.array(mealOptionSchema),
});

export const mealPlanSchema = z.object({
  title: optText(200),
  objective: optText(500),
  targetCalories: optNum,
  targetProtein: optNum,
  targetCarbs: optNum,
  targetFats: optNum,
  meals: z.array(mealSchema),
});

export type MealPlanFormValues = z.infer<typeof mealPlanSchema>;
