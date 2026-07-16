# Assessment Input Bounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inclusive maximum bound to every body-assessment numeric input (percentages ≤ 100, plus anti-typo ceilings on the rest) across the three validation layers.

**Architecture:** Three independent single-file validation changes (API class-validator DTO, web zod, mobile zod), each with its own test. No data-model or behavior change beyond rejecting over-max values.

**Tech Stack:** class-validator (API), zod (web + mobile).

## Global Constraints

- Same branch `feat/assessment-percent-circumferences` (adds to open PR #40).
- NO new dependencies. pt-BR messages ("Não pode passar de 100." for the % fields; "Valor acima do limite." for the others). Match each file's quote style (single quotes).
- Keep the existing min / strictly-positive / integer rules; only ADD a max.
- API + mobile tests use **Jest** (no `vitest` import); web uses **vitest**.
- Do NOT push/PR unless asked. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Verify: API `pnpm --filter @nutri-plus/api test`; web `pnpm --filter @nutri-plus/web test` + `pnpm --filter @nutri-plus/web exec tsc --noEmit`; mobile `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` + `pnpm --filter @nutri-plus/mobile test`.

**Bounds table (inclusive max):**

| Fields | Max |
|---|---|
| `bodyFatPercentage`, `bodyWaterPercentage`, `muscleMassPercentage`, `leanMassPercentage` | 100 |
| `weight` | 500 |
| `waistCircumference`, `abdomenCircumference`, `hipCircumference`, `thighCircumference`, `armCircumference`, `contractedArmCircumference`, `chestCircumference`, `calfCircumference` | 300 |
| `basalMetabolicRate` | 10000 |
| `boneMass` | 20 |
| `metabolicAge` | 120 |
| `visceralFat` | 60 |
| `muscleMass`, `leanMass` (legacy kg, API DTO only — not in zod) | 500 |

---

### Task 1: API DTO max bounds (`create-assessment.dto.ts`)

**Files:**
- Modify: `apps/api/src/patients/dto/create-assessment.dto.ts`
- Test: `apps/api/src/patients/dto/create-assessment.dto.spec.ts` (new, Jest)

**Interfaces:** none new (`UpdateAssessmentDto extends CreateAssessmentDto {}` inherits automatically — do not edit it).

- [ ] **Step 1: Write the failing DTO validation test**

Create `create-assessment.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAssessmentDto } from './create-assessment.dto';

const errorsFor = (obj: Record<string, unknown>) =>
  validate(plainToInstance(CreateAssessmentDto, obj));

describe('CreateAssessmentDto bounds', () => {
  it('rejects a percentage above 100', async () => {
    const errs = await errorsFor({ bodyFatPercentage: 150 });
    expect(errs.some((e) => e.property === 'bodyFatPercentage' && e.constraints?.max)).toBe(true);
  });

  it('accepts a percentage of exactly 100', async () => {
    const errs = await errorsFor({ bodyFatPercentage: 100 });
    expect(errs).toHaveLength(0);
  });

  it('rejects an over-max weight', async () => {
    const errs = await errorsFor({ weight: 9999 });
    expect(errs.some((e) => e.property === 'weight' && e.constraints?.max)).toBe(true);
  });

  it('still accepts legacy kg muscleMass/leanMass within bound (backward compat)', async () => {
    const errs = await errorsFor({ muscleMass: 40, leanMass: 55 });
    expect(errs).toHaveLength(0);
  });

  it('accepts a fully valid payload', async () => {
    const errs = await errorsFor({ weight: 80, bodyFatPercentage: 20, waistCircumference: 90, metabolicAge: 30 });
    expect(errs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @nutri-plus/api test -- create-assessment.dto`
Expected: FAIL — the "rejects a percentage above 100" / "rejects an over-max weight" cases find no `max` constraint (none exists yet).

- [ ] **Step 3: Add `Max` decorators**

In `create-assessment.dto.ts`, add `Max` to the `class-validator` import (alongside `Min`), then add one `@Max(N)` line per numeric field, placed after that field's existing validators. The values:

- `weight`: after `@IsPositive()` → `@Max(500)`
- `bodyFatPercentage`, `bodyWaterPercentage`, `muscleMassPercentage`, `leanMassPercentage`: `@Max(100)`
- `muscleMass`, `leanMass` (legacy kg): `@Max(500)`
- `visceralFat`: `@Max(60)`
- `basalMetabolicRate`: after `@IsPositive()` → `@Max(10000)`
- `boneMass`: `@Max(20)`
- `metabolicAge`: after `@IsInt() @Min(0)` → `@Max(120)`
- `waistCircumference`, `hipCircumference`, `chestCircumference`, `armCircumference`, `thighCircumference`, `abdomenCircumference`, `contractedArmCircumference`, `calfCircumference`: `@Max(300)`

Example (the `bodyFatPercentage`, `weight`, and `metabolicAge` shapes):

```ts
  @IsOptional()
  @IsPositive()
  @Max(500)
  weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  bodyFatPercentage?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  metabolicAge?: number;
```

`notes` (`@MaxLength(2000)`) and `assessmentDate` are unchanged.

- [ ] **Step 4: Run it — expect PASS + full API suite**

Run: `pnpm --filter @nutri-plus/api test -- create-assessment.dto` then `pnpm --filter @nutri-plus/api test`
Expected: the new spec passes; the whole API suite stays green (additive validation).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/patients/dto/create-assessment.dto.ts apps/api/src/patients/dto/create-assessment.dto.spec.ts
git commit -m "feat(api): max-value bounds on assessment DTO inputs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Web zod max bounds (`lib/validation/assessment.ts`)

**Files:**
- Modify: `apps/web/src/lib/validation/assessment.ts`
- Test: `apps/web/src/lib/validation/assessment.test.ts` (extend)

**Interfaces:** none new (`AssessmentValues` type shape unchanged).

- [ ] **Step 1: Add the failing tests**

Append to `assessment.test.ts` (inside the `describe('assessmentSchema')` block):

```ts
  it('rejects a percentage above 100', () => {
    const r = assessmentSchema.safeParse({ bodyFatPercentage: 150 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.message === 'Não pode passar de 100.')).toBe(true);
  });
  it('accepts a percentage of exactly 100', () => {
    expect(assessmentSchema.safeParse({ bodyFatPercentage: 100 }).success).toBe(true);
  });
  it('rejects an over-max circumference', () => {
    expect(assessmentSchema.safeParse({ waistCircumference: 9999 }).success).toBe(false);
  });
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/web && pnpm exec vitest run "src/lib/validation/assessment.test.ts" -t "above 100"`
Expected: FAIL — 150 currently passes (no max).

- [ ] **Step 3: Replace the helpers with bounded factories + wire each field**

In `assessment.ts`, replace the three `const optNonNegative`/`optPositive`/`optInt` helper definitions with:

```ts
const optBounded = (max: number, msg = 'Valor acima do limite.') =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(0, 'Não pode ser negativo.').max(max, msg).optional(),
  );
const optPositiveBounded = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive('Deve ser maior que zero.').max(max, 'Valor acima do limite.').optional(),
  );
const optIntBounded = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int('Deve ser um número inteiro.').min(0, 'Não pode ser negativo.').max(max, 'Valor acima do limite.').optional(),
  );
const percent = optBounded(100, 'Não pode passar de 100.');
```

Then set each field in the `z.object`:

```ts
    weight: optPositiveBounded(500),
    bodyFatPercentage: percent,
    muscleMassPercentage: percent,
    leanMassPercentage: percent,
    visceralFat: optBounded(60),
    basalMetabolicRate: optPositiveBounded(10000),
    bodyWaterPercentage: percent,
    boneMass: optBounded(20),
    metabolicAge: optIntBounded(120),
    waistCircumference: optBounded(300),
    hipCircumference: optBounded(300),
    chestCircumference: optBounded(300),
    armCircumference: optBounded(300),
    thighCircumference: optBounded(300),
    abdomenCircumference: optBounded(300),
    contractedArmCircumference: optBounded(300),
    calfCircumference: optBounded(300),
```

Keep `NUMERIC_KEYS`, the `assessmentDate`/`notes` fields, and the `.refine('Informe ao menos uma métrica', { path: ['weight'] })` unchanged.

- [ ] **Step 4: Run tests + tsc — expect PASS**

Run: `cd apps/web && pnpm exec vitest run "src/lib/validation/assessment.test.ts"` then `cd apps/web && pnpm exec tsc --noEmit`
Expected: all assessment-validation tests pass; tsc clean. (The existing "non-positive weight" / coercion tests still pass — the lower bounds are unchanged.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/validation/assessment.ts apps/web/src/lib/validation/assessment.test.ts
git commit -m "feat(web): max-value bounds on assessment inputs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Mobile zod max bounds (`lib/validation/assessment.ts`)

**Files:**
- Modify: `apps/mobile/lib/validation/assessment.ts`
- Test: `apps/mobile/lib/validation/assessment.test.ts` (extend)

**Interfaces:** none new.

The mobile validation file is structurally identical to the web one — apply the same change.

- [ ] **Step 1: Add the failing tests**

Append to `apps/mobile/lib/validation/assessment.test.ts` (inside its `describe('assessmentSchema')`; the file uses Jest globals — do NOT add a vitest import):

```ts
  it('rejects a percentage above 100', () => {
    const r = assessmentSchema.safeParse({ bodyFatPercentage: 150 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.message === 'Não pode passar de 100.')).toBe(true);
  });

  it('accepts a percentage of exactly 100', () => {
    expect(assessmentSchema.safeParse({ bodyFatPercentage: 100 }).success).toBe(true);
  });

  it('rejects an over-max circumference', () => {
    expect(assessmentSchema.safeParse({ waistCircumference: 9999 }).success).toBe(false);
  });
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @nutri-plus/mobile test -- assessment`
Expected: FAIL — 150 currently passes.

- [ ] **Step 3: Apply the same helper-factory replacement + per-field wiring**

In `apps/mobile/lib/validation/assessment.ts`, make the identical change as Task 2 Step 3: replace the `optNonNegative`/`optPositive`/`optInt` helpers with `optBounded`/`optPositiveBounded`/`optIntBounded` + `percent` (exact code from Task 2 Step 3), and wire each field to the same bounds (`weight: optPositiveBounded(500)`, the four % fields: `percent`, `visceralFat: optBounded(60)`, `basalMetabolicRate: optPositiveBounded(10000)`, `boneMass: optBounded(20)`, `metabolicAge: optIntBounded(120)`, the eight circumferences: `optBounded(300)`). Keep `NUMERIC_KEYS`, `assessmentDate`/`notes`, and the `.refine('Informe ao menos uma métrica', { path: ['weight'] })` unchanged.

- [ ] **Step 4: Run tsc + tests — expect PASS**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` then `pnpm --filter @nutri-plus/mobile test -- assessment`
Expected: tsc clean; assessment tests pass.

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/lib/validation/assessment.ts" "apps/mobile/lib/validation/assessment.test.ts"
git commit -m "feat(mobile): max-value bounds on assessment inputs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

```bash
pnpm --filter @nutri-plus/api test
pnpm --filter @nutri-plus/web test
pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
pnpm --filter @nutri-plus/mobile test
```

Manual (optional): in the web assessment dialog, enter `120` in "% Gordura" → shows "Não pode passar de 100."; a huge value in a circumference → "Valor acima do limite."; valid values (e.g. 100% exactly, weight 80) save normally.
