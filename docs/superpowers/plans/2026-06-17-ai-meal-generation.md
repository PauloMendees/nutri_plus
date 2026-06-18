# AI Meal Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /v1/ai/generate-meal-plan` so a nutritionist generates an initial, editable meal plan for a linked patient — the server computes daily calorie/macro targets deterministically, the AI structures the foods, and the result is persisted as a normal `MealPlan`.

**Architecture:** A new `meal-generation` feature module orchestrates: fetch patient (ownership-scoped) → validate inputs → compute targets (pure functions) → call the Step 05 `OpenAIProvider.generateStructured` gateway → persist via a new `MealPlansService.createGeneratedPlan`. The AI never calculates; the response schema returns only `foodName`/`quantity`. Editing reuses the existing Step 04 meal-plans endpoints.

**Tech Stack:** NestJS, Prisma (PostgreSQL), Zod (+ `openai/helpers/zod`), Jest, `jest-mock-extended`, supertest.

## Global Constraints

- **AI must not calculate.** All critical numbers (calories, macros) are computed in backend services before the prompt; the response schema must not ask the model for derived numbers. (Step 05 contract.)
- **OpenAI only via `OpenAIProvider`.** Never import the `openai` SDK outside `apps/api/src/ai/`. Consumers call `generateStructured`.
- **Model tier, never literal model names.** Request `tier: 'smart'`.
- **Ownership never leaks.** A missing or non-owned patient returns `404`, identical to a not-found one.
- **`aiGenerated` is server-controlled.** Never accepted from request input; set `true` only inside `createGeneratedPlan`.
- **Audit is automatic.** `OpenAIProvider` already persists `AIInteraction` rows (success and failure). Do not write audit rows in this feature.
- **Tests run on default env** (`OPENAI_API_KEY=sk-test`, default model tiers); no real OpenAI key is ever used. The e2e happy path overrides `OpenAIProvider` with a stub.
- **Working directory for all paths below:** `apps/api/` (commands assume you are in `apps/api/`).

---

### Task 1: Data model — daily target fields on `MealPlan`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (the `MealPlan` model, ~line 131-145)
- Create: `apps/api/prisma/migrations/<timestamp>_add_meal_plan_targets/migration.sql` (generated)
- Modify: `apps/api/src/generated/prisma/**` (regenerated client — committed)

**Interfaces:**
- Produces: `MealPlan.targetCalories`, `.targetProtein`, `.targetCarbs`, `.targetFats` — all `Float?` (nullable; manual Step 04 plans leave them null).

- [ ] **Step 1: Add the four fields to the `MealPlan` model**

In `apps/api/prisma/schema.prisma`, inside `model MealPlan`, add the four fields after `aiGenerated`:

```prisma
  aiGenerated Boolean  @default(false) // server-controlled; true for AI-generated plans
  // Server-computed daily nutrition targets (null for manually created plans).
  targetCalories Float? // kcal/day
  targetProtein  Float? // g/day
  targetCarbs    Float? // g/day
  targetFats     Float? // g/day
  createdAt   DateTime @default(now())
```

- [ ] **Step 2: Create and apply the migration**

Run: `pnpm exec prisma migrate dev --name add_meal_plan_targets`
Expected: a new migration folder under `prisma/migrations/`, "Your database is now in sync with your schema", and the Prisma client regenerates automatically.

- [ ] **Step 3: Verify the client typechecks with the new fields**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: exits 0 (no errors). Confirms the regenerated client compiles.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/generated/prisma
git commit -m "feat(api): add MealPlan daily target fields + migration"
```

---

### Task 2: Nutrition calculation engine

**Files:**
- Create: `apps/api/src/meal-generation/nutrition.ts`
- Test: `apps/api/src/meal-generation/nutrition.spec.ts`

**Interfaces:**
- Produces:
  - `ACTIVITY_FACTOR`, `OBJECTIVE_FACTOR`, `PROTEIN_PER_KG` (`Record<enum, number>`), `FAT_PCT` (`number`)
  - `interface NutritionInputs { weightKg: number; heightCm: number; age: number; gender: Gender; objective: PatientObjective; activityLevel: ActivityLevel; measuredBmr?: number | null }`
  - `interface NutritionTargets { calories: number; protein: number; carbs: number; fats: number }`
  - `computeAge(birthDate: Date, now: Date): number`
  - `computeBmr(i: { weightKg: number; heightCm: number; age: number; gender: Gender; measuredBmr?: number | null }): number`
  - `computeTargets(i: NutritionInputs): NutritionTargets`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/meal-generation/nutrition.spec.ts`:

```ts
import { computeAge, computeBmr, computeTargets } from './nutrition';

describe('computeAge', () => {
  it('returns whole years when the birthday has passed this year', () => {
    expect(computeAge(new Date('1990-06-10'), new Date('2026-06-17'))).toBe(36);
  });

  it('subtracts a year when the birthday has not been reached yet', () => {
    expect(computeAge(new Date('1990-06-20'), new Date('2026-06-17'))).toBe(35);
  });
});

describe('computeBmr', () => {
  it('uses Mifflin-St Jeor with +5 for MALE', () => {
    expect(
      computeBmr({ weightKg: 80, heightCm: 180, age: 30, gender: 'MALE' }),
    ).toBe(1780);
  });

  it('uses -161 for FEMALE', () => {
    expect(
      computeBmr({ weightKg: 60, heightCm: 165, age: 40, gender: 'FEMALE' }),
    ).toBeCloseTo(1270.25, 2);
  });

  it('uses -78 for OTHER / PREFER_NOT_TO_SAY', () => {
    expect(
      computeBmr({ weightKg: 70, heightCm: 170, age: 25, gender: 'OTHER' }),
    ).toBeCloseTo(1559.5, 2);
  });

  it('prefers a measured BMR over the formula', () => {
    expect(
      computeBmr({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        gender: 'MALE',
        measuredBmr: 1500,
      }),
    ).toBe(1500);
  });

  it('falls back to the formula when measuredBmr is null or 0', () => {
    expect(
      computeBmr({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        gender: 'MALE',
        measuredBmr: null,
      }),
    ).toBe(1780);
    expect(
      computeBmr({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        gender: 'MALE',
        measuredBmr: 0,
      }),
    ).toBe(1780);
  });
});

describe('computeTargets', () => {
  it('computes calories and macros for a MALE weight-loss case (formula BMR)', () => {
    const t = computeTargets({
      weightKg: 80,
      heightCm: 180,
      age: 30,
      gender: 'MALE',
      objective: 'WEIGHT_LOSS',
      activityLevel: 'MODERATE',
      measuredBmr: null,
    });
    // BMR 1780 * 1.55 = 2759; * 0.80 = 2207
    expect(t.calories).toBe(2207);
    expect(t.protein).toBe(160); // 2.0 g/kg * 80
    expect(t.fats).toBe(61); // round(2207*0.25/9)
    expect(t.carbs).toBe(255); // round((2207 - 640 - 549)/4)
  });

  it('uses the maintenance protein factor (1.6 g/kg) and a measured BMR', () => {
    const t = computeTargets({
      weightKg: 70,
      heightCm: 175,
      age: 35,
      gender: 'MALE',
      objective: 'MAINTENANCE',
      activityLevel: 'SEDENTARY',
      measuredBmr: 1500,
    });
    // 1500 * 1.2 = 1800; * 1.0 = 1800
    expect(t.calories).toBe(1800);
    expect(t.protein).toBe(112); // 1.6 * 70
    expect(t.fats).toBe(50); // round(1800*0.25/9)
    expect(t.carbs).toBe(226); // round((1800 - 448 - 450)/4)
  });

  it('floors carbs at 0 when protein+fat exceed the calorie budget', () => {
    const t = computeTargets({
      weightKg: 100,
      heightCm: 170,
      age: 30,
      gender: 'MALE',
      objective: 'WEIGHT_LOSS',
      activityLevel: 'SEDENTARY',
      measuredBmr: 500,
    });
    // 500 * 1.2 = 600; * 0.8 = 480 cal; protein 200g -> 800 cal alone
    expect(t.carbs).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- nutrition.spec`
Expected: FAIL — "Cannot find module './nutrition'".

- [ ] **Step 3: Implement `nutrition.ts`**

Create `apps/api/src/meal-generation/nutrition.ts`:

```ts
import {
  ActivityLevel,
  Gender,
  PatientObjective,
} from '../generated/prisma/client';

// --- Tunable constants (single source of truth) ---

// kcal multiplier applied to BMR by activity level.
export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

// Calorie adjustment applied to TDEE by objective.
export const OBJECTIVE_FACTOR: Record<PatientObjective, number> = {
  WEIGHT_LOSS: 0.8,
  MAINTENANCE: 1.0,
  RECOMPOSITION: 0.95,
  MUSCLE_GAIN: 1.1,
};

// Protein grams per kg bodyweight by objective.
export const PROTEIN_PER_KG: Record<PatientObjective, number> = {
  WEIGHT_LOSS: 2.0,
  MUSCLE_GAIN: 2.0,
  RECOMPOSITION: 2.0,
  MAINTENANCE: 1.6,
};

// Share of calories from fat.
export const FAT_PCT = 0.25;

// Mifflin-St Jeor sex constant. OTHER / PREFER_NOT_TO_SAY use the average of the
// male (+5) and female (-161) constants: -78.
const SEX_CONSTANT: Record<Gender, number> = {
  MALE: 5,
  FEMALE: -161,
  OTHER: -78,
  PREFER_NOT_TO_SAY: -78,
};

export interface NutritionInputs {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  objective: PatientObjective;
  activityLevel: ActivityLevel;
  measuredBmr?: number | null;
}

export interface NutritionTargets {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

// Whole years between birthDate and now, accounting for whether the birthday has
// occurred yet this year.
export function computeAge(birthDate: Date, now: Date): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}

// Measured bioimpedance BMR when present and positive; otherwise Mifflin-St Jeor.
export function computeBmr(i: {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  measuredBmr?: number | null;
}): number {
  if (i.measuredBmr && i.measuredBmr > 0) {
    return i.measuredBmr;
  }
  return 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age + SEX_CONSTANT[i.gender];
}

export function computeTargets(i: NutritionInputs): NutritionTargets {
  const bmr = computeBmr(i);
  const tdee = bmr * ACTIVITY_FACTOR[i.activityLevel];
  const calories = Math.round(tdee * OBJECTIVE_FACTOR[i.objective]);
  const protein = Math.round(PROTEIN_PER_KG[i.objective] * i.weightKg);
  const fats = Math.round((calories * FAT_PCT) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fats * 9) / 4));
  return { calories, protein, carbs, fats };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- nutrition.spec`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/meal-generation/nutrition.ts src/meal-generation/nutrition.spec.ts
git commit -m "feat(api): nutrition calculation engine (BMR/TDEE/macros)"
```

---

### Task 3: AI response Zod schema

**Files:**
- Create: `apps/api/src/meal-generation/schema/meal-plan-response.schema.ts`
- Test: `apps/api/src/meal-generation/schema/meal-plan-response.schema.spec.ts`

**Interfaces:**
- Produces:
  - `mealPlanResponseSchema` — a `z.ZodType` for `{ title, meals: [{ name, timeLabel, items: [{ foodName, quantity }] }] }`
  - `type MealPlanResponse = z.infer<typeof mealPlanResponseSchema>`
  - `timeLabel` is `z.string().nullable()` (NOT `.optional()`) — OpenAI structured-output strict mode requires every property present; nullable is allowed, optional is not.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/meal-generation/schema/meal-plan-response.schema.spec.ts`:

```ts
import { mealPlanResponseSchema } from './meal-plan-response.schema';

const valid = {
  title: 'Weight Loss Plan',
  meals: [
    {
      name: 'Breakfast',
      timeLabel: '08:00',
      items: [{ foodName: 'Eggs', quantity: '2 units' }],
    },
  ],
};

describe('mealPlanResponseSchema', () => {
  it('accepts a well-formed plan', () => {
    expect(mealPlanResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a null timeLabel', () => {
    const r = mealPlanResponseSchema.safeParse({
      ...valid,
      meals: [{ ...valid.meals[0], timeLabel: null }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an empty meals array', () => {
    expect(
      mealPlanResponseSchema.safeParse({ title: 'x', meals: [] }).success,
    ).toBe(false);
  });

  it('rejects a meal with no items', () => {
    expect(
      mealPlanResponseSchema.safeParse({
        title: 'x',
        meals: [{ name: 'Breakfast', timeLabel: null, items: [] }],
      }).success,
    ).toBe(false);
  });

  it('rejects a missing foodName', () => {
    expect(
      mealPlanResponseSchema.safeParse({
        title: 'x',
        meals: [{ name: 'B', timeLabel: null, items: [{ quantity: '2' }] }],
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- meal-plan-response.schema`
Expected: FAIL — "Cannot find module './meal-plan-response.schema'".

- [ ] **Step 3: Implement the schema**

Create `apps/api/src/meal-generation/schema/meal-plan-response.schema.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- meal-plan-response.schema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/meal-generation/schema
git commit -m "feat(api): meal-plan AI response schema"
```

---

### Task 4: Prompt builder

**Files:**
- Create: `apps/api/src/ai/prompts/meal-plan.prompt.ts`
- Test: `apps/api/src/ai/prompts/meal-plan.prompt.spec.ts`
- Delete: `apps/api/src/ai/prompts/.gitkeep` (now that the directory has real content)

**Interfaces:**
- Produces:
  - `MEAL_PLAN_SYSTEM_PROMPT: string`
  - `interface MealPlanPromptContext { age: number; weightKg: number; heightCm: number; gender: string; objective: string; activityLevel: string; restrictions: string | null; allergies: string | null; targets: { calories: number; protein: number; carbs: number; fats: number } }`
  - `buildMealPlanUserPrompt(ctx: MealPlanPromptContext): string` — returns JSON-stringified context.
- Note: types are declared locally here (no import from `meal-generation/`) to avoid a cross-module cycle.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/ai/prompts/meal-plan.prompt.spec.ts`:

```ts
import {
  MEAL_PLAN_SYSTEM_PROMPT,
  buildMealPlanUserPrompt,
} from './meal-plan.prompt';

describe('meal-plan prompt', () => {
  it('system prompt instructs the model not to recalculate targets', () => {
    expect(MEAL_PLAN_SYSTEM_PROMPT).toMatch(/not.*recalculate|do not.*calculat/i);
  });

  it('user prompt is valid JSON carrying the targets and context', () => {
    const json = buildMealPlanUserPrompt({
      age: 30,
      weightKg: 80,
      heightCm: 180,
      gender: 'MALE',
      objective: 'WEIGHT_LOSS',
      activityLevel: 'MODERATE',
      restrictions: 'lactose',
      allergies: null,
      targets: { calories: 2207, protein: 160, carbs: 255, fats: 61 },
    });
    const parsed = JSON.parse(json);
    expect(parsed.targets.calories).toBe(2207);
    expect(parsed.weightKg).toBe(80);
    expect(parsed.restrictions).toBe('lactose');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- meal-plan.prompt`
Expected: FAIL — "Cannot find module './meal-plan.prompt'".

- [ ] **Step 3: Implement the prompt builder**

Create `apps/api/src/ai/prompts/meal-plan.prompt.ts`:

```ts
// Pure prompt builder for meal-plan generation. No DI, no SDK. The consumer
// (meal-generation feature) imports these; types are declared locally to avoid a
// cross-module dependency cycle.

export interface MealPlanPromptContext {
  age: number;
  weightKg: number;
  heightCm: number;
  gender: string;
  objective: string;
  activityLevel: string;
  restrictions: string | null;
  allergies: string | null;
  targets: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
}

export const MEAL_PLAN_SYSTEM_PROMPT = [
  'You are a clinical nutrition assistant.',
  'Build a daily meal plan that meets the GIVEN daily targets (calories and',
  'protein/carbs/fats grams). The targets are already calculated for you — do',
  'NOT recalculate them and do not return any numeric values.',
  'Respect the patient restrictions and allergies strictly.',
  'Return meals in chronological order, each with realistic foods and amounts.',
].join(' ');

// The user prompt is the structured context as JSON. The provider sends it
// verbatim; never include free-form instructions here.
export function buildMealPlanUserPrompt(ctx: MealPlanPromptContext): string {
  return JSON.stringify(ctx);
}
```

- [ ] **Step 4: Remove the now-obsolete placeholder**

Run: `git rm src/ai/prompts/.gitkeep`
Expected: `.gitkeep` staged for deletion.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- meal-plan.prompt`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ai/prompts/meal-plan.prompt.ts src/ai/prompts/meal-plan.prompt.spec.ts
git commit -m "feat(api): meal-plan generation prompt builder"
```

---

### Task 5: Persist generated plans + editable targets

**Files:**
- Modify: `apps/api/src/meal-plans/dto/update-meal-plan.dto.ts`
- Modify: `apps/api/src/meal-plans/meal-plans.service.ts`
- Modify: `apps/api/src/meal-plans/meal-plans.module.ts`
- Test: `apps/api/src/meal-plans/meal-plans.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `MealPlansService` private helpers `requireOwnedPatient(ctx, patientId)` and `mealsCreateInput(meals)` (already exist), `FULL_TREE` (already defined).
- Produces:
  - `UpdateMealPlanDto` gains optional `targetCalories`, `targetProtein`, `targetCarbs`, `targetFats` (`number`, `@Min(0)`).
  - `MealPlansService.createGeneratedPlan(ctx: AuthContext, args: { patientId: string; title?: string; targets: { calories: number; protein: number; carbs: number; fats: number }; meals: { name: string; timeLabel?: string; items: { foodName: string; quantity: string }[] }[] })` → persisted `MealPlan` with full tree, `aiGenerated: true`.
  - `MealPlansModule` exports `MealPlansService`.

- [ ] **Step 1: Add the failing test for `createGeneratedPlan`**

In `apps/api/src/meal-plans/meal-plans.service.spec.ts`, add a new `describe` block (after the existing `createPlan` block):

```ts
  describe('createGeneratedPlan', () => {
    it('verifies ownership and creates an aiGenerated plan with targets and ordered tree', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      prisma.mealPlan.create.mockResolvedValue({ id: 'mp1' } as any);

      const result = await service.createGeneratedPlan(ctx, {
        patientId: 'p1',
        title: 'AI Plan',
        targets: { calories: 2000, protein: 150, carbs: 200, fats: 56 },
        meals: [
          { name: 'Breakfast', timeLabel: '08:00', items: [{ foodName: 'Egg', quantity: '2' }] },
        ],
      });

      expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', nutritionistId: 'nutri-1' },
        select: { id: true },
      });
      expect(prisma.mealPlan.create).toHaveBeenCalledWith({
        data: {
          patientId: 'p1',
          title: 'AI Plan',
          aiGenerated: true,
          targetCalories: 2000,
          targetProtein: 150,
          targetCarbs: 200,
          targetFats: 56,
          meals: {
            create: [
              {
                name: 'Breakfast',
                timeLabel: '08:00',
                instructions: undefined,
                order: 0,
                items: { create: [{ foodName: 'Egg', quantity: '2', order: 0 }] },
              },
            ],
          },
        },
        include: FULL_TREE,
      });
      expect(result).toEqual({ id: 'mp1' });
    });

    it('throws NotFound and does not create when the patient is not owned', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.createGeneratedPlan(ctx, {
          patientId: 'other',
          targets: { calories: 1, protein: 1, carbs: 1, fats: 1 },
          meals: [],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.mealPlan.create).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- meal-plans.service.spec`
Expected: FAIL — `service.createGeneratedPlan is not a function`.

- [ ] **Step 3: Add `createGeneratedPlan` to the service**

In `apps/api/src/meal-plans/meal-plans.service.ts`, add this method after `createPlan` (it reuses the existing private `requireOwnedPatient` and `mealsCreateInput`):

```ts
  // Persists an AI-generated plan: ownership-checked, aiGenerated=true, with the
  // server-computed daily targets. Reuses the same ordered-tree write as manual
  // creation so all MealPlan aggregate writes live here.
  async createGeneratedPlan(
    ctx: AuthContext,
    args: {
      patientId: string;
      title?: string;
      targets: { calories: number; protein: number; carbs: number; fats: number };
      meals: {
        name: string;
        timeLabel?: string;
        items: { foodName: string; quantity: string }[];
      }[];
    },
  ) {
    await this.requireOwnedPatient(ctx, args.patientId);
    return this.prisma.mealPlan.create({
      data: {
        patientId: args.patientId,
        title: args.title,
        aiGenerated: true,
        targetCalories: args.targets.calories,
        targetProtein: args.targets.protein,
        targetCarbs: args.targets.carbs,
        targetFats: args.targets.fats,
        meals: this.mealsCreateInput(args.meals),
      },
      include: FULL_TREE,
    });
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- meal-plans.service.spec`
Expected: PASS.

- [ ] **Step 5: Add the editable target fields to `UpdateMealPlanDto`**

In `apps/api/src/meal-plans/dto/update-meal-plan.dto.ts`, add `IsNumber` and `Min` to the `class-validator` import, then add four fields after `objective`:

```ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MealDto } from './meal.dto';
```

```ts
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetCalories?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetProtein?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetCarbs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetFats?: number;
```

- [ ] **Step 6: Export `MealPlansService` from its module**

In `apps/api/src/meal-plans/meal-plans.module.ts`, add the `exports` array:

```ts
import { Module } from '@nestjs/common';
import { MealPlansController } from './meal-plans.controller';
import { PatientMealPlansController } from './patient-meal-plans.controller';
import { MealPlansService } from './meal-plans.service';

@Module({
  controllers: [MealPlansController, PatientMealPlansController],
  providers: [MealPlansService],
  exports: [MealPlansService],
})
export class MealPlansModule {}
```

- [ ] **Step 7: Run the full meal-plans unit suite and typecheck**

Run: `pnpm test -- meal-plans.service.spec && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS and exit 0. (`updatePlan`/`createPlan` already pass `data: top`, so the new DTO fields flow through PATCH automatically.)

- [ ] **Step 8: Commit**

```bash
git add src/meal-plans
git commit -m "feat(api): createGeneratedPlan + editable meal-plan targets"
```

---

### Task 6: Meal generation orchestration service

**Files:**
- Create: `apps/api/src/meal-generation/meal-generation.service.ts`
- Test: `apps/api/src/meal-generation/meal-generation.service.spec.ts`

**Interfaces:**
- Consumes: `OpenAIProvider.generateStructured` (from `../ai/openai.provider`), `MealPlansService.createGeneratedPlan` (Task 5), `PrismaService`, `computeAge`/`computeTargets` (Task 2), `mealPlanResponseSchema`/`MealPlanResponse` (Task 3), `MEAL_PLAN_SYSTEM_PROMPT`/`buildMealPlanUserPrompt` (Task 4), `AIInteractionType` enum.
- Produces: `MealGenerationService.generate(ctx: AuthContext, patientId: string)` → the persisted `MealPlan`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/meal-generation/meal-generation.service.spec.ts`:

```ts
import {
  BadGatewayException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIProvider } from '../ai/openai.provider';
import { MealPlansService } from '../meal-plans/meal-plans.service';
import { MealGenerationService } from './meal-generation.service';
import { AuthContext } from '../auth/types/auth-context';

const ctx: AuthContext = {
  authProviderId: 'sub-n',
  email: 'n@x.com',
  name: 'Nut',
  user: {
    id: 'user-n',
    role: 'NUTRITIONIST',
    nutritionistProfile: { id: 'nutri-1' },
    patientProfile: null,
  } as any,
};

// A patient with everything needed to calculate.
function completePatient() {
  return {
    id: 'p1',
    height: 180,
    birthDate: new Date('1994-01-01'),
    gender: 'MALE',
    objective: 'WEIGHT_LOSS',
    activityLevel: 'MODERATE',
    restrictions: 'lactose',
    allergies: null,
    assessments: [{ weight: 80, basalMetabolicRate: null }],
  };
}

const aiResponse = {
  title: 'Weight Loss Plan',
  meals: [
    {
      name: 'Breakfast',
      timeLabel: '08:00',
      items: [{ foodName: 'Eggs', quantity: '2 units' }],
    },
  ],
};

describe('MealGenerationService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let provider: DeepMockProxy<OpenAIProvider>;
  let mealPlans: DeepMockProxy<MealPlansService>;
  let service: MealGenerationService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    provider = mockDeep<OpenAIProvider>();
    mealPlans = mockDeep<MealPlansService>();
    service = new MealGenerationService(prisma, provider, mealPlans);
  });

  it('throws NotFound when the patient is missing or not owned', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(null);

    await expect(service.generate(ctx, 'p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', nutritionistId: 'nutri-1' },
      include: { assessments: { orderBy: { assessmentDate: 'desc' }, take: 1 } },
    });
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it('throws 422 naming each missing required field', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({
      id: 'p1',
      height: null,
      birthDate: null,
      gender: null,
      objective: null,
      activityLevel: null,
      restrictions: null,
      allergies: null,
      assessments: [], // no weight
    } as any);

    const err = await service.generate(ctx, 'p1').catch((e) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(err.message).toMatch(/weight/);
    expect(err.message).toMatch(/height/);
    expect(err.message).toMatch(/birthDate/);
    expect(err.message).toMatch(/gender/);
    expect(err.message).toMatch(/objective/);
    expect(err.message).toMatch(/activityLevel/);
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it('generates with computed targets and persists via createGeneratedPlan', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(completePatient() as any);
    provider.generateStructured.mockResolvedValue(aiResponse as any);
    mealPlans.createGeneratedPlan.mockResolvedValue({ id: 'mp1' } as any);

    const result = await service.generate(ctx, 'p1');

    // Provider invoked with the smart tier, our schema, and targets in the prompt.
    const call = provider.generateStructured.mock.calls[0][0];
    expect(call.tier).toBe('smart');
    expect(call.type).toBe('MEAL_PLAN_GENERATION');
    expect(call.patientId).toBe('p1');
    const userCtx = JSON.parse(call.user);
    expect(userCtx.targets.calories).toBeGreaterThan(0);
    expect(userCtx.targets.protein).toBe(160); // 2.0 g/kg * 80

    // Persistence delegated with aiGenerated targets + normalized tree.
    expect(mealPlans.createGeneratedPlan).toHaveBeenCalledWith(ctx, {
      patientId: 'p1',
      title: 'Weight Loss Plan',
      targets: userCtx.targets,
      meals: [
        {
          name: 'Breakfast',
          timeLabel: '08:00',
          items: [{ foodName: 'Eggs', quantity: '2 units' }],
        },
      ],
    });
    expect(result).toEqual({ id: 'mp1' });
  });

  it('propagates a provider failure and does not persist', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(completePatient() as any);
    provider.generateStructured.mockRejectedValue(
      new BadGatewayException('AI provider unavailable'),
    );

    await expect(service.generate(ctx, 'p1')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(mealPlans.createGeneratedPlan).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- meal-generation.service.spec`
Expected: FAIL — "Cannot find module './meal-generation.service'".

- [ ] **Step 3: Implement the service**

Create `apps/api/src/meal-generation/meal-generation.service.ts`:

```ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIProvider } from '../ai/openai.provider';
import { MealPlansService } from '../meal-plans/meal-plans.service';
import { AuthContext } from '../auth/types/auth-context';
import { AIInteractionType } from '../generated/prisma/client';
import { computeAge, computeTargets, NutritionInputs } from './nutrition';
import { mealPlanResponseSchema } from './schema/meal-plan-response.schema';
import {
  MEAL_PLAN_SYSTEM_PROMPT,
  buildMealPlanUserPrompt,
} from '../ai/prompts/meal-plan.prompt';

@Injectable()
export class MealGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: OpenAIProvider,
    private readonly mealPlans: MealPlansService,
  ) {}

  async generate(ctx: AuthContext, patientId: string) {
    const nutritionistId = this.nutritionistId(ctx);

    // Ownership + data fetch in one scoped query (404 covers missing/not-owned).
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId },
      include: {
        assessments: { orderBy: { assessmentDate: 'desc' }, take: 1 },
      },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const inputs = this.requireInputs(patient);
    const targets = computeTargets(inputs);

    const generated = await this.provider.generateStructured({
      tier: 'smart',
      system: MEAL_PLAN_SYSTEM_PROMPT,
      user: buildMealPlanUserPrompt({
        age: inputs.age,
        weightKg: inputs.weightKg,
        heightCm: inputs.heightCm,
        gender: inputs.gender,
        objective: inputs.objective,
        activityLevel: inputs.activityLevel,
        restrictions: patient.restrictions ?? null,
        allergies: patient.allergies ?? null,
        targets,
      }),
      schema: mealPlanResponseSchema,
      schemaName: 'meal_plan',
      type: AIInteractionType.MEAL_PLAN_GENERATION,
      patientId,
    });

    return this.mealPlans.createGeneratedPlan(ctx, {
      patientId,
      title: generated.title,
      targets,
      meals: generated.meals.map((m) => ({
        name: m.name,
        timeLabel: m.timeLabel ?? undefined,
        items: m.items,
      })),
    });
  }

  // Validates that every field the calculation needs is present; otherwise 422
  // listing exactly what is missing. weight + measured BMR come from the latest
  // assessment; the rest from the profile.
  private requireInputs(patient: {
    height: number | null;
    birthDate: Date | null;
    gender: NutritionInputs['gender'] | null;
    objective: NutritionInputs['objective'] | null;
    activityLevel: NutritionInputs['activityLevel'] | null;
    assessments: { weight: number | null; basalMetabolicRate: number | null }[];
  }): NutritionInputs {
    const latest = patient.assessments[0];
    const missing: string[] = [];
    if (latest?.weight == null) missing.push('weight (latest assessment)');
    if (patient.height == null) missing.push('height');
    if (patient.birthDate == null) missing.push('birthDate');
    if (patient.gender == null) missing.push('gender');
    if (patient.objective == null) missing.push('objective');
    if (patient.activityLevel == null) missing.push('activityLevel');
    if (missing.length > 0) {
      throw new UnprocessableEntityException(
        `Cannot generate a plan: missing ${missing.join(', ')}`,
      );
    }

    return {
      weightKg: latest!.weight!,
      heightCm: patient.height!,
      age: computeAge(patient.birthDate!, new Date()),
      gender: patient.gender!,
      objective: patient.objective!,
      activityLevel: patient.activityLevel!,
      measuredBmr: latest!.basalMetabolicRate,
    };
  }

  private nutritionistId(ctx: AuthContext): string {
    const id = ctx.user?.nutritionistProfile?.id;
    if (!id) {
      throw new ForbiddenException('Nutritionist profile required');
    }
    return id;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- meal-generation.service.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/meal-generation/meal-generation.service.ts src/meal-generation/meal-generation.service.spec.ts
git commit -m "feat(api): meal generation orchestration service"
```

---

### Task 7: Controller, DTO, and module wiring

**Files:**
- Create: `apps/api/src/meal-generation/dto/generate-meal-plan.dto.ts`
- Create: `apps/api/src/meal-generation/meal-generation.controller.ts`
- Create: `apps/api/src/meal-generation/meal-generation.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `MealGenerationService.generate` (Task 6), `AiModule` (exports `OpenAIProvider`), `MealPlansModule` (exports `MealPlansService`).
- Produces: route `POST /v1/ai/generate-meal-plan`, body `{ patientId: uuid }`, nutritionist-only; `MealGenerationModule`.

- [ ] **Step 1: Create the request DTO**

Create `apps/api/src/meal-generation/dto/generate-meal-plan.dto.ts`:

```ts
import { IsUUID } from 'class-validator';

// patientId is the only input; all clinical data is read from stored records.
export class GenerateMealPlanDto {
  @IsUUID()
  patientId!: string;
}
```

- [ ] **Step 2: Create the controller**

Create `apps/api/src/meal-generation/meal-generation.controller.ts` (route path `ai` + URI versioning ⇒ `/v1/ai/generate-meal-plan`):

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { MealGenerationService } from './meal-generation.service';
import { GenerateMealPlanDto } from './dto/generate-meal-plan.dto';

@ApiTags('ai')
@ApiBearerAuth()
@Controller({ path: 'ai', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class MealGenerationController {
  constructor(private readonly mealGeneration: MealGenerationService) {}

  @Post('generate-meal-plan')
  generateMealPlan(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: GenerateMealPlanDto,
  ) {
    return this.mealGeneration.generate(ctx, dto.patientId);
  }
}
```

- [ ] **Step 3: Create the module**

Create `apps/api/src/meal-generation/meal-generation.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MealPlansModule } from '../meal-plans/meal-plans.module';
import { MealGenerationController } from './meal-generation.controller';
import { MealGenerationService } from './meal-generation.service';

@Module({
  imports: [AiModule, MealPlansModule],
  controllers: [MealGenerationController],
  providers: [MealGenerationService],
})
export class MealGenerationModule {}
```

- [ ] **Step 4: Register the module in `AppModule`**

In `apps/api/src/app.module.ts`, add the import and the module entry:

```ts
import { MealGenerationModule } from './meal-generation/meal-generation.module';
```

Add `MealGenerationModule` to the `imports` array, after `AiModule`:

```ts
    MealPlansModule,
    AiModule,
    MealGenerationModule,
```

- [ ] **Step 5: Verify the app boots and typechecks**

Run: `pnpm test -- app.module.spec && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS and exit 0 (the existing `app.module.spec.ts` compiles the full module graph; DI wiring resolves).

- [ ] **Step 6: Commit**

```bash
git add src/meal-generation/dto src/meal-generation/meal-generation.controller.ts src/meal-generation/meal-generation.module.ts src/app.module.ts
git commit -m "feat(api): wire POST /v1/ai/generate-meal-plan"
```

---

### Task 8: End-to-end tests + OpenAPI doc assertion

**Files:**
- Create: `apps/api/test/meal-generation.e2e-spec.ts`
- Modify: `apps/api/test/docs.e2e-spec.ts`

**Interfaces:**
- Consumes: the live route from Task 7, the JWKS/`syncUser` helpers (pattern from `meal-plans.e2e-spec.ts`), `OpenAIProvider` (overridden with a stub so no real API call happens).

- [ ] **Step 1: Add the OpenAPI path assertion (will fail until the route exists — it does after Task 7)**

In `apps/api/test/docs.e2e-spec.ts`, add `'/v1/ai/generate-meal-plan'` to the `arrayContaining` list:

```ts
        '/v1/me/meal-plans',
        '/v1/me/meal-plans/{id}',
        '/v1/ai/generate-meal-plan',
      ]),
```

- [ ] **Step 2: Write the e2e spec**

Create `apps/api/test/meal-generation.e2e-spec.ts`. It overrides `OpenAIProvider` with a stub (no real OpenAI call) and `ConfigService` (same pattern as other e2e specs). Patient clinical data is set via the real patient PATCH + assessment endpoints.

```ts
import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { OpenAIProvider } from '../src/ai/openai.provider';
import { signSupabaseJwt, startJwksServer, JwksServer } from './helpers/jwks';

describe('Meal Generation (e2e)', () => {
  let app: INestApplication;
  let jwks: JwksServer;

  // Stub the AI gateway: returns a fixed plan, records nothing real.
  const generateStructured = jest.fn();
  const providerStub = { generateStructured };

  async function syncUser(opts: {
    sub: string;
    email: string;
    name: string;
    role: UserRole;
    referralCode?: string;
  }) {
    const token = signSupabaseJwt({
      sub: opts.sub,
      email: opts.email,
      name: opts.name,
    });
    const res = await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: opts.role, referralCode: opts.referralCode })
      .expect(200);
    return { token, body: res.body };
  }

  let nutA: { token: string; body: any };
  let nutB: { token: string; body: any };
  let patient: { token: string; body: any };

  beforeAll(async () => {
    jwks = await startJwksServer();
    process.env.SUPABASE_URL = jwks.url;

    const { ConfigService } = await import('@nestjs/config');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue({ getOrThrow: (key: string) => process.env[key] })
      .overrideProvider(OpenAIProvider)
      .useValue(providerStub)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  beforeEach(async () => {
    generateStructured.mockReset();
    nutA = await syncUser({
      sub: 'nutA',
      email: 'a@x.com',
      name: 'Nut A',
      role: UserRole.NUTRITIONIST,
    });
    nutB = await syncUser({
      sub: 'nutB',
      email: 'b@x.com',
      name: 'Nut B',
      role: UserRole.NUTRITIONIST,
    });
    patient = await syncUser({
      sub: 'patP',
      email: 'p@x.com',
      name: 'Pat P',
      role: UserRole.PATIENT,
      referralCode: nutA.body.nutritionistProfile.referralCode,
    });
  });

  const patientId = () => patient.body.patientProfile.id;

  // Fills the profile clinical fields + a body assessment so the calculation has
  // all required inputs.
  async function completeProfile() {
    await request(app.getHttpServer())
      .patch(`/v1/patients/${patientId()}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({
        birthDate: '1994-01-01',
        gender: 'MALE',
        height: 180,
        objective: 'WEIGHT_LOSS',
        activityLevel: 'MODERATE',
        restrictions: 'lactose',
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/v1/patients/${patientId()}/assessments`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ weight: 80 })
      .expect(201);
  }

  it('generates and persists an editable AI plan with targets', async () => {
    await completeProfile();
    generateStructured.mockResolvedValue({
      title: 'Weight Loss Plan',
      meals: [
        {
          name: 'Breakfast',
          timeLabel: '08:00',
          items: [{ foodName: 'Eggs', quantity: '2 units' }],
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .post('/v1/ai/generate-meal-plan')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: patientId() })
      .expect(201);

    expect(res.body.aiGenerated).toBe(true);
    expect(res.body.title).toBe('Weight Loss Plan');
    expect(res.body.targetCalories).toBeGreaterThan(0);
    expect(res.body.targetProtein).toBe(160); // 2.0 g/kg * 80
    expect(res.body.meals).toHaveLength(1);
    expect(res.body.meals[0].items[0].foodName).toBe('Eggs');

    // The provider received the smart tier and targets in the prompt.
    const call = generateStructured.mock.calls[0][0];
    expect(call.tier).toBe('smart');
    expect(JSON.parse(call.user).targets.protein).toBe(160);

    // The generated plan is a normal editable meal plan (Step 04 PATCH).
    const patched = await request(app.getHttpServer())
      .patch(`/v1/meal-plans/${res.body.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ targetCalories: 1900 })
      .expect(200);
    expect(patched.body.targetCalories).toBe(1900);
  });

  it('returns 422 when the patient is missing data for calculation', async () => {
    // No completeProfile(): profile + assessment are empty.
    await request(app.getHttpServer())
      .post('/v1/ai/generate-meal-plan')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: patientId() })
      .expect(422);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it('returns 404 generating for another nutritionist patient', async () => {
    await completeProfile();
    await request(app.getHttpServer())
      .post('/v1/ai/generate-meal-plan')
      .set('Authorization', `Bearer ${nutB.token}`)
      .send({ patientId: patientId() })
      .expect(404);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it('rejects a patient caller (403) and a missing patientId (400)', async () => {
    await request(app.getHttpServer())
      .post('/v1/ai/generate-meal-plan')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ patientId: patientId() })
      .expect(403);

    await request(app.getHttpServer())
      .post('/v1/ai/generate-meal-plan')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({})
      .expect(400);
  });
});
```

- [ ] **Step 3: Run the e2e suite**

Run: `pnpm test:e2e -- meal-generation docs`
Expected: PASS — meal-generation cases green; docs spec includes the new path. (Requires the local test database, as with all e2e specs.)

- [ ] **Step 4: Run the full test suites as a regression check**

Run: `pnpm test && pnpm test:e2e`
Expected: all green (no existing specs broken by the schema/DTO changes).

- [ ] **Step 5: Commit**

```bash
git add test/meal-generation.e2e-spec.ts test/docs.e2e-spec.ts
git commit -m "test(api): e2e for AI meal generation + OpenAPI path"
```

---

## Self-Review

**Spec coverage:**
- Endpoint `POST /v1/ai/generate-meal-plan`, nutritionist-only, body `{ patientId }` → Task 7 + Task 8.
- Read stored profile + latest assessment → Task 6 (`findFirst` with `assessments take:1`).
- Calculation engine (BMR measured/fallback, TDEE, calorie target, macros, constants) → Task 2.
- Target storage on `MealPlan` (additive migration) → Task 1; persisted in Task 5.
- AI returns food+amount only, no derived numbers → Task 3 (schema), Task 4 (prompt).
- Persist `aiGenerated: true` + targets, reuse ordered-tree write → Task 5.
- Editable targets via `UpdateMealPlanDto`/PATCH → Task 5 + Task 8 PATCH assertion.
- Errors: 404 unowned/missing (Task 6/8), 422 incomplete (Task 6/8), 403 non-nutritionist (Task 8), 400 missing patientId (Task 8), 502 from provider (Task 6 propagation test).
- Audit automatic via provider → no task needed (constraint documented).
- Editing reuses Step 04 endpoints → no new code (verified by Task 8 PATCH).
- Tests: nutrition unit (T2), schema unit (T3), prompt unit (T4), service unit (T6), persistence unit (T5), e2e + docs (T8).

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code.

**Type consistency:** `computeTargets`/`computeAge`/`computeBmr` signatures match between Task 2 definition and Task 6 use. `NutritionTargets` `{ calories, protein, carbs, fats }` matches `createGeneratedPlan`'s `targets` param (Task 5) and the prompt context `targets` (Task 4). `createGeneratedPlan` meals shape `{ name; timeLabel?; items: { foodName; quantity }[] }` matches the `.map` normalization in Task 6 (`timeLabel ?? undefined`). `mealPlanResponseSchema` `timeLabel` is nullable; the service maps null→undefined before persistence. Route path `ai` + URI versioning ⇒ `/v1/ai/generate-meal-plan` consistent across Tasks 7 and 8 and the docs assertion.
