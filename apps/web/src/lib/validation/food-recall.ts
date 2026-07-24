import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const optText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().max(max, `Máximo de ${max} caracteres.`).optional());

const optNum = z.preprocess(
  emptyToUndefined,
  z.coerce.number().min(0, 'Não pode ser negativo.').optional(),
);

const recallItemSchema = z.object({
  foodName: optText(200),
  quantity: optText(100),
  foodId: z.preprocess(emptyToUndefined, z.string().optional()),
  grams: optNum,
  calories: optNum,
  protein: optNum,
  carbs: optNum,
  fats: optNum,
  fiber: optNum,
  sodium: optNum,
});

const recallMealSchema = z.object({
  name: optText(200),
  timeLabel: optText(100),
  items: z.array(recallItemSchema),
});

export const foodRecallSchema = z.object({
  recallDate: optText(40),
  notes: optText(2000),
  meals: z.array(recallMealSchema),
});

export type FoodRecallFormValues = z.infer<typeof foodRecallSchema>;
