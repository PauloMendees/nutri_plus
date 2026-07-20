import { z } from 'zod';

// The shape the AI must return. Every property is present (OpenAI structured-
// output strict mode). Per-item macros are AI ESTIMATES; the daily targets remain
// server-computed and are NOT here. Each meal carries interchangeable options
// (the prompt asks for exactly two, macro-comparable); strict mode does not enforce
// array length, so the schema requires >= 1 option and >= 1 item per option.
export const mealPlanResponseSchema = z.object({
  title: z.string(),
  meals: z
    .array(
      z.object({
        name: z.string(),
        timeLabel: z.string().nullable(),
        options: z
          .array(
            z.object({
              label: z.string(),
              items: z
                .array(
                  z.object({
                    foodName: z.string(),
                    quantity: z.string(),
                    grams: z.number(),
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
      }),
    )
    .min(1),
});

export type MealPlanResponse = z.infer<typeof mealPlanResponseSchema>;
