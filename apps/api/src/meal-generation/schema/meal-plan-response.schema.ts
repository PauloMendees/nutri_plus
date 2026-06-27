import { z } from 'zod';

// The shape the AI must return. Every property is present (OpenAI structured-
// output strict mode). Per-item macros are AI ESTIMATES (kcal + protein/carbs/
// fats in grams); the daily targets remain server-computed and are NOT here.
export const mealPlanResponseSchema = z.object({
  title: z.string(),
  meals: z
    .array(
      z.object({
        name: z.string(),
        timeLabel: z.string().nullable(),
        items: z
          .array(
            z.object({
              foodName: z.string(),
              quantity: z.string(),
              calories: z.number(),
              protein: z.number(),
              carbs: z.number(),
              fats: z.number(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export type MealPlanResponse = z.infer<typeof mealPlanResponseSchema>;
