import { z } from 'zod';

// The shape the AI must return. Constraints (`.min(1)`) enforce doc 06's
// "reject empty meals / malformed" at the provider's Zod gate. timeLabel is
// nullable (not optional) because OpenAI structured-output strict mode requires
// every property to be present. No macro fields: the AI never returns derived
// numbers (Step 05 contract).
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
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export type MealPlanResponse = z.infer<typeof mealPlanResponseSchema>;
