# Nutrition Targets — GET/TMB Calculators + Macro Goals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Metas" calculator on the nutritionist web app that computes TMB/GET and macro targets from patient data and persists the chosen targets per patient (history).

**Architecture:** Pure calc functions live once in `@nutri-plus/shared-types` (used by web for live preview and by the API for authoritative recompute-on-save). A new `NutritionTarget` model stores each saved target. A new API module (mirroring Silhueta) exposes POST/GET; a new web "Metas" tab drives the form.

**Tech Stack:** NestJS + Prisma, Next.js + react-query + react-hook-form, `@nutri-plus/shared-types`.

## Global Constraints

- Branch `feat/nutrition-targets` (off main; spec committed b214e1a). NO new dependencies. pt-BR.
- Calc functions live in **shared-types** (pure, no deps) — single source used by web (live preview) + API (authoritative). The server **recomputes on POST** and never trusts client numbers.
- Katch-McArdle with null `bodyFatPercentage` → server records `formula: MIFFLIN`.
- Additive migration on the shared dev DB (`prisma migrate dev`; run `prisma generate` if it doesn't). shared-types rebuilt after edits.
- Match file quote styles (api single quotes; web per-file). API + mobile tests = **Jest**; web = **vitest**. shared-types has **no test runner** — the pure-calc unit test lives in the API jest suite.
- Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push/PR.
- **Enum boundary:** the shared-types enums (`TmbFormula`/`Gender`/`ActivityLevel`) and the prisma-generated enums are nominally distinct but value-identical. The DTO + calc use the **shared-types** enums (no cast on the read/calc side). On the **Prisma write** (`nutritionTarget.create({ data: { formula, sex, activityLevel, ... } })`), if `tsc` flags the enum fields, cast each to the prisma enum type — import them aliased, e.g. `import { TmbFormula as PrismaTmbFormula, Gender as PrismaGender, ActivityLevel as PrismaActivityLevel } from '../generated/prisma/client';` and write `formula: formula as PrismaTmbFormula` (value-identical, safe). Do not change the calc/DTO to prisma enums.

**Exact formulas/values (verbatim):** Mifflin `10·kg+6.25·cm−5·age+s` (s=+5 M / −161 F); Harris-Benedict revised M `88.362+13.397·kg+4.799·cm−5.677·age` / F `447.593+9.247·kg+3.098·cm−4.330·age`; Katch `370+21.6·LBM`, LBM=`kg·(1−bf%/100)`; activity 1.2/1.375/1.55/1.725/1.9; suggested kcal `GET×(1+adj)`, adj WEIGHT_LOSS −0.20 / MUSCLE_GAIN +0.10 / else 0; protein default 1.8 g/kg, fat default 25%, carbs = remainder (clamp ≥ 0); grams/kcal rounded to whole; age = whole years.

---

### Task 1: Foundation — schema + shared-types calc & types

**Files:**
- Create: `packages/shared-types/src/v1/nutrition-target.ts`, `packages/shared-types/src/v1/energy.ts`
- Modify: `packages/shared-types/src/v1/index.ts`
- Modify: `apps/api/prisma/schema.prisma` (+ migration)

**Produces:** `TmbFormula` enum; `NutritionTarget` + `CreateNutritionTargetRequest` types; pure calc `ageFromBirthDate`, `effectiveFormula`, `computeTmb`, `activityFactor`, `computeGet`, `objectiveAdjustment`, `suggestedCalories`, `computeMacros`.

- [ ] **Step 1: shared-types — types**

Create `packages/shared-types/src/v1/nutrition-target.ts`:
```ts
import type { ActivityLevel, Gender } from './patient';

export enum TmbFormula {
  MIFFLIN = 'MIFFLIN',
  HARRIS_BENEDICT = 'HARRIS_BENEDICT',
  KATCH_MCARDLE = 'KATCH_MCARDLE',
}

// Dates are ISO strings over the wire. `sex` is the biological sex used for the
// estimate (always MALE/FEMALE — resolved in the form when gender is OTHER/unspecified).
export interface NutritionTarget {
  id: string;
  patientId: string;
  targetDate: string;
  createdAt: string;
  formula: TmbFormula;
  sex: Gender;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  bodyFatPercentage: number | null;
  activityLevel: ActivityLevel | null;
  activityFactor: number;
  tmb: number;
  get: number;
  targetCalories: number;
  proteinGramsPerKg: number;
  proteinGrams: number;
  fatPercent: number;
  fatGrams: number;
  carbGrams: number;
}

export interface CreateNutritionTargetRequest {
  formula: TmbFormula;
  sex: Gender; // MALE | FEMALE
  age?: number;
  heightCm?: number;
  weightKg?: number;
  bodyFatPercentage?: number;
  activityLevel?: ActivityLevel;
  targetCalories: number;
  proteinGramsPerKg: number;
  fatPercent: number;
}
```

- [ ] **Step 2: shared-types — pure calc**

Create `packages/shared-types/src/v1/energy.ts`:
```ts
import { ActivityLevel, Gender, PatientObjective } from './patient';
import { TmbFormula } from './nutrition-target';

// Whole years between birthDate and `today` (default now).
export function ageFromBirthDate(
  birthDate: string | Date | null | undefined,
  today: Date = new Date(),
): number | null {
  if (!birthDate) return null;
  const d = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

// Katch requires body-fat %; without it the effective formula is Mifflin.
export function effectiveFormula(
  formula: TmbFormula,
  bodyFatPercentage: number | null | undefined,
): TmbFormula {
  return formula === TmbFormula.KATCH_MCARDLE && bodyFatPercentage == null
    ? TmbFormula.MIFFLIN
    : formula;
}

export interface TmbInput {
  formula: TmbFormula;
  sex: Gender; // MALE | FEMALE
  weightKg: number;
  heightCm: number;
  age: number;
  bodyFatPercentage?: number | null;
}

export function computeTmb(input: TmbInput): number {
  const { formula, sex, weightKg, heightCm, age, bodyFatPercentage } = input;
  const male = sex === Gender.MALE;
  const eff = effectiveFormula(formula, bodyFatPercentage);
  if (eff === TmbFormula.KATCH_MCARDLE) {
    const lbm = weightKg * (1 - (bodyFatPercentage as number) / 100);
    return 370 + 21.6 * lbm;
  }
  if (eff === TmbFormula.HARRIS_BENEDICT) {
    return male
      ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
      : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (male ? 5 : -161);
}

export function activityFactor(level: ActivityLevel): number {
  switch (level) {
    case ActivityLevel.SEDENTARY:
      return 1.2;
    case ActivityLevel.LIGHT:
      return 1.375;
    case ActivityLevel.MODERATE:
      return 1.55;
    case ActivityLevel.ACTIVE:
      return 1.725;
    case ActivityLevel.VERY_ACTIVE:
      return 1.9;
  }
}

export function computeGet(tmb: number, level: ActivityLevel): number {
  return tmb * activityFactor(level);
}

export function objectiveAdjustment(objective: PatientObjective | null | undefined): number {
  if (objective === PatientObjective.WEIGHT_LOSS) return -0.2;
  if (objective === PatientObjective.MUSCLE_GAIN) return 0.1;
  return 0; // MAINTENANCE, RECOMPOSITION, null
}

export function suggestedCalories(
  get: number,
  objective: PatientObjective | null | undefined,
): number {
  return get * (1 + objectiveAdjustment(objective));
}

export interface MacroInput {
  targetCalories: number;
  weightKg: number;
  proteinGramsPerKg: number;
  fatPercent: number;
}
export interface MacroResult {
  proteinGrams: number;
  proteinKcal: number;
  fatGrams: number;
  fatKcal: number;
  carbGrams: number;
  carbKcal: number;
}

export function computeMacros(input: MacroInput): MacroResult {
  const { targetCalories, weightKg, proteinGramsPerKg, fatPercent } = input;
  const proteinGrams = Math.round(proteinGramsPerKg * weightKg);
  const proteinKcal = proteinGrams * 4;
  const fatKcal = Math.round((targetCalories * fatPercent) / 100);
  const fatGrams = Math.round(fatKcal / 9);
  const carbKcal = Math.max(0, Math.round(targetCalories - proteinKcal - fatKcal));
  const carbGrams = Math.round(carbKcal / 4);
  return { proteinGrams, proteinKcal, fatGrams, fatKcal, carbGrams, carbKcal };
}
```

- [ ] **Step 3: shared-types — export + build**

Add to `packages/shared-types/src/v1/index.ts`:
```ts
export * from './nutrition-target';
export * from './energy';
```
Run: `pnpm --filter @nutri-plus/shared-types build` (exit 0).

- [ ] **Step 4: Prisma — model + enum**

In `apps/api/prisma/schema.prisma`:
- Add `enum TmbFormula { MIFFLIN HARRIS_BENEDICT KATCH_MCARDLE }`.
- Add back-relation on `model PatientProfile`: `nutritionTargets NutritionTarget[]`.
- Add the model:
```prisma
model NutritionTarget {
  id                String   @id @default(uuid())
  patientId         String
  patient           PatientProfile @relation(fields: [patientId], references: [id])
  targetDate        DateTime @default(now())
  createdAt         DateTime @default(now())

  formula           TmbFormula
  sex               Gender
  age               Int?
  heightCm          Float?
  weightKg          Float?
  bodyFatPercentage Float?
  activityLevel     ActivityLevel?
  activityFactor    Float

  tmb               Float
  get               Float

  targetCalories    Float
  proteinGramsPerKg Float
  proteinGrams      Float
  fatPercent        Float
  fatGrams          Float
  carbGrams         Float

  @@index([patientId, targetDate])
}
```

- [ ] **Step 5: Migrate + generate**

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name nutrition-targets`
Expected: new migration (CREATE TABLE "NutritionTarget" + CREATE TYPE "TmbFormula"), applied, client regenerated (run `pnpm --filter @nutri-plus/api exec prisma generate` if not).

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/v1/nutrition-target.ts packages/shared-types/src/v1/energy.ts packages/shared-types/src/v1/index.ts apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: NutritionTarget model + shared energy/macro calc + types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: API — nutrition-targets module (recompute + persist) + calc test

**Files:**
- Create: `apps/api/src/nutrition-targets/nutrition-targets.module.ts`, `nutrition-targets.controller.ts`, `nutrition-targets.service.ts`, `dto/create-nutrition-target.dto.ts`, `nutrition-targets.service.spec.ts`, `energy.spec.ts`
- Modify: `apps/api/src/app.module.ts` (register `NutritionTargetsModule`)

**Consumes:** shared calc (`computeTmb`, `computeGet`, `activityFactor`, `effectiveFormula`, `computeMacros`, `suggestedCalories`, `ageFromBirthDate`); `PATIENT_DETAIL_INCLUDE` shape (latest assessment weight/bodyFat); `resolveScopeNutritionistId`. **Produces:** `POST/GET /v1/patients/:id/nutrition-targets`.

- [ ] **Step 1: DTO**

Create `apps/api/src/nutrition-targets/dto/create-nutrition-target.dto.ts`:
Import the enums from **shared-types** (the same enums the calc functions use), so `dto.formula/sex/activityLevel` feed the calc with no cast. `@IsEnum` accepts a shared-types enum object.
```ts
import { IsEnum, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ActivityLevel, Gender, TmbFormula } from '@nutri-plus/shared-types';

export class CreateNutritionTargetDto {
  @IsEnum(TmbFormula)
  formula!: TmbFormula;

  // Biological sex used for the estimate — resolved in the form; only M/F allowed.
  @IsIn([Gender.MALE, Gender.FEMALE])
  sex!: Gender;

  @IsOptional() @IsNumber() @Min(0) @Max(120)
  age?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(300)
  heightCm?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(500)
  weightKg?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  bodyFatPercentage?: number;
  @IsOptional() @IsEnum(ActivityLevel)
  activityLevel?: ActivityLevel;

  @IsNumber() @Min(0) @Max(20000)
  targetCalories!: number;
  @IsNumber() @Min(0) @Max(10)
  proteinGramsPerKg!: number;
  @IsNumber() @Min(0) @Max(100)
  fatPercent!: number;
}
```

- [ ] **Step 2: Failing calc unit test (Jest, in the API suite)**

Create `apps/api/src/nutrition-targets/energy.spec.ts`:
```ts
import {
  computeTmb,
  computeGet,
  suggestedCalories,
  computeMacros,
  effectiveFormula,
} from '@nutri-plus/shared-types';
import { ActivityLevel, Gender, PatientObjective, TmbFormula } from '@nutri-plus/shared-types';

describe('energy calc', () => {
  it('Mifflin (male 80kg/180cm/30y) = 1780', () => {
    expect(
      computeTmb({ formula: TmbFormula.MIFFLIN, sex: Gender.MALE, weightKg: 80, heightCm: 180, age: 30 }),
    ).toBeCloseTo(1780, 5);
  });
  it('Mifflin female subtracts 161', () => {
    expect(
      computeTmb({ formula: TmbFormula.MIFFLIN, sex: Gender.FEMALE, weightKg: 80, heightCm: 180, age: 30 }),
    ).toBeCloseTo(1614, 5);
  });
  it('Katch (80kg, 20% fat) = 1752.4', () => {
    expect(
      computeTmb({ formula: TmbFormula.KATCH_MCARDLE, sex: Gender.MALE, weightKg: 80, heightCm: 180, age: 30, bodyFatPercentage: 20 }),
    ).toBeCloseTo(1752.4, 4);
  });
  it('Katch without body-fat% falls back to Mifflin', () => {
    expect(effectiveFormula(TmbFormula.KATCH_MCARDLE, null)).toBe(TmbFormula.MIFFLIN);
    expect(
      computeTmb({ formula: TmbFormula.KATCH_MCARDLE, sex: Gender.MALE, weightKg: 80, heightCm: 180, age: 30, bodyFatPercentage: null }),
    ).toBeCloseTo(1780, 5);
  });
  it('GET moderate = TMB*1.55; weight-loss suggestion = GET*0.8', () => {
    const get = computeGet(1780, ActivityLevel.MODERATE);
    expect(get).toBeCloseTo(2759, 5);
    expect(suggestedCalories(get, PatientObjective.WEIGHT_LOSS)).toBeCloseTo(2207.2, 4);
  });
  it('macros: 2000 kcal, 80kg, 1.8 g/kg, 25% fat → P144/F56/C231', () => {
    expect(computeMacros({ targetCalories: 2000, weightKg: 80, proteinGramsPerKg: 1.8, fatPercent: 25 })).toEqual({
      proteinGrams: 144,
      proteinKcal: 576,
      fatGrams: 56,
      fatKcal: 500,
      carbGrams: 231,
      carbKcal: 924,
    });
  });
});
```
Run: `pnpm --filter @nutri-plus/api test -- energy` → PASS immediately (calc already exists from Task 1). (This test also proves shared-types is importable from the API suite.)

- [ ] **Step 3: Failing service spec**

Create `apps/api/src/nutrition-targets/nutrition-targets.service.spec.ts` (Jest; mock PrismaService + the scope helper) asserting: `create` → 404 for non-owned patient; derives missing `weightKg`/`bodyFatPercentage`/`age` from the patient + latest assessment when the DTO omits them; **recomputes** `tmb/get/activityFactor/proteinGrams/fatGrams/carbGrams` server-side (ignoring any client numbers); Katch with null bf% persists `formula: MIFFLIN`; persists a `NutritionTarget` and returns it. `list` → 404 non-owned; returns targets `targetDate` desc. Run → FAIL.

- [ ] **Step 4: Service**

Create `apps/api/src/nutrition-targets/nutrition-targets.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  computeGet,
  computeMacros,
  computeTmb,
  effectiveFormula,
  activityFactor,
  ageFromBirthDate,
} from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { CreateNutritionTargetDto } from './dto/create-nutrition-target.dto';

const round = (n: number) => Math.round(n);

@Injectable()
export class NutritionTargetsService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireOwnedPatient(ctx: AuthContext, patientId: string) {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId: resolveScopeNutritionistId(ctx) },
      include: { assessments: { orderBy: { assessmentDate: 'desc' }, take: 1 } },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async create(ctx: AuthContext, patientId: string, dto: CreateNutritionTargetDto) {
    const patient = await this.requireOwnedPatient(ctx, patientId);
    const latest = patient.assessments[0];

    const weightKg = dto.weightKg ?? latest?.weight ?? null;
    const heightCm = dto.heightCm ?? patient.height ?? null;
    const age = dto.age ?? ageFromBirthDate(patient.birthDate) ?? null;
    const bodyFatPercentage = dto.bodyFatPercentage ?? latest?.bodyFatPercentage ?? null;
    const activityLevelValue = dto.activityLevel ?? patient.activityLevel ?? null;

    // Server recomputes everything — client numbers are never trusted.
    const formula = effectiveFormula(dto.formula, bodyFatPercentage);
    const tmb =
      weightKg != null && heightCm != null && age != null
        ? computeTmb({ formula, sex: dto.sex, weightKg, heightCm, age, bodyFatPercentage })
        : 0;
    const factor = activityLevelValue ? activityFactor(activityLevelValue) : 1;
    const get = activityLevelValue ? computeGet(tmb, activityLevelValue) : tmb;
    const macros = computeMacros({
      targetCalories: dto.targetCalories,
      weightKg: weightKg ?? 0,
      proteinGramsPerKg: dto.proteinGramsPerKg,
      fatPercent: dto.fatPercent,
    });

    return this.prisma.nutritionTarget.create({
      data: {
        patientId,
        formula,
        sex: dto.sex,
        age,
        heightCm,
        weightKg,
        bodyFatPercentage,
        activityLevel: activityLevelValue,
        activityFactor: factor,
        tmb: round(tmb),
        get: round(get),
        targetCalories: round(dto.targetCalories),
        proteinGramsPerKg: dto.proteinGramsPerKg,
        proteinGrams: macros.proteinGrams,
        fatPercent: dto.fatPercent,
        fatGrams: macros.fatGrams,
        carbGrams: macros.carbGrams,
      },
    });
  }

  async list(ctx: AuthContext, patientId: string) {
    await this.requireOwnedPatient(ctx, patientId);
    return this.prisma.nutritionTarget.findMany({
      where: { patientId },
      orderBy: { targetDate: 'desc' },
    });
  }
}
```

- [ ] **Step 5: Controller + module + registration**

Create `nutrition-targets.controller.ts` (mirror the Silhueta controller — `@Controller({ path: 'patients/:id/nutrition-targets', version: '1' })`, `@ApiTags('nutrition-targets')`, `@ApiBearerAuth()`, `@Roles(UserRole.NUTRITIONIST)`):
```ts
  @Post()
  create(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateNutritionTargetDto,
  ) {
    return this.service.create(ctx, id, dto);
  }

  @Get()
  list(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.service.list(ctx, id);
  }
```
Create `nutrition-targets.module.ts` (`@Module({ controllers: [NutritionTargetsController], providers: [NutritionTargetsService] })` — Prisma is `@Global`). Register `NutritionTargetsModule` in `apps/api/src/app.module.ts`.

- [ ] **Step 6: Run specs + full API suite → PASS. Commit** (`feat(api): nutrition-targets endpoints (recompute + persist)`).

Run: `pnpm --filter @nutri-plus/api test -- nutrition-targets energy` then `pnpm --filter @nutri-plus/api test` and `pnpm --filter @nutri-plus/api exec tsc --noEmit`.

---

### Task 3: Web — data layer + "Metas" tab

**Files:**
- Create: `apps/web/src/lib/api/nutrition-targets.ts`, `lib/queries/nutrition-targets.ts`, `components/patients/nutrition-targets-section.tsx`, `components/patients/nutrition-targets-section.test.tsx`
- Modify: `apps/web/src/components/patients/patient-detail.tsx` (add the "metas" tab)

**Consumes:** shared calc (`computeTmb`, `computeGet`, `suggestedCalories`, `computeMacros`, `effectiveFormula`, `ageFromBirthDate`, `activityFactor`), `NutritionTarget`, `CreateNutritionTargetRequest`, `TmbFormula`; `browserApiFetch`; `OBJECTIVE_LABELS`/`ACTIVITY_LABELS`/`GENDER_LABELS` from `@/lib/patients/labels`.

- [ ] **Step 1: Data layer**

Create `apps/web/src/lib/api/nutrition-targets.ts`:
```ts
import type { CreateNutritionTargetRequest, NutritionTarget } from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listNutritionTargets(patientId: string): Promise<NutritionTarget[]> {
  return browserApiFetch<NutritionTarget[]>(`/patients/${patientId}/nutrition-targets`);
}

export function createNutritionTarget(
  patientId: string,
  body: CreateNutritionTargetRequest,
): Promise<NutritionTarget> {
  return browserApiFetch<NutritionTarget>(`/patients/${patientId}/nutrition-targets`, {
    method: 'POST',
    body,
  });
}
```
Create `lib/queries/nutrition-targets.ts` (mirror `lib/queries/silhueta.ts`): `useNutritionTargets(patientId)` (key `['nutrition-targets', patientId]`, `enabled: Boolean(patientId)`), `useCreateNutritionTarget(patientId)` (mutation → invalidate `['nutrition-targets', patientId]`).

- [ ] **Step 2: Section component (form + live preview + save + history)**

Create `apps/web/src/components/patients/nutrition-targets-section.tsx` (mirror the RHF/dialog structure of `silhueta-section.tsx`). It receives `{ patient }: { patient: PatientDetail }` (so it can prefill from `patient.height`, `patient.gender`, `patient.birthDate`, `patient.objective`, `patient.activityLevel`, and `patient.assessments[0]` for weight/bodyFat).

Requirements to implement (complete code, mirroring existing web form patterns):
- Local form state (react-hook-form) with defaults derived from the patient: `formula` (default `TmbFormula.MIFFLIN`), `sex` (from `patient.gender` if MALE/FEMALE, else empty → nutritionist must pick), `age` (`ageFromBirthDate(patient.birthDate)`), `heightCm` (`patient.height`), `weightKg` (`patient.assessments[0]?.weight`), `bodyFatPercentage` (`patient.assessments[0]?.bodyFatPercentage`), `activityLevel` (`patient.activityLevel`), `proteinGramsPerKg` (`1.8`), `fatPercent` (`25`).
- A formula `<select>` (Mifflin/Harris/Katch via `GENDER_LABELS`-style label maps you define inline in pt-BR: `Mifflin-St Jeor`, `Harris-Benedict`, `Katch-McArdle (usa % de gordura)`). Katch `<option>` is `disabled` when `bodyFatPercentage` is empty/null.
- A `sex` `<select>` (Masculino/Feminino) shown/required when `patient.gender` is not MALE/FEMALE (use `GENDER_LABELS`).
- Live computation (recomputed on every render from the watched form values), guarding for missing inputs:
  ```ts
  const age = Number(watch('age')); const weightKg = Number(watch('weightKg'));
  const heightCm = Number(watch('heightCm')); const bf = watch('bodyFatPercentage') === '' ? null : Number(watch('bodyFatPercentage'));
  const canComputeTmb = sex && weightKg > 0 && heightCm > 0 && age > 0;
  const tmb = canComputeTmb ? computeTmb({ formula, sex, weightKg, heightCm, age, bodyFatPercentage: bf }) : null;
  const get = tmb != null && activityLevel ? computeGet(tmb, activityLevel) : null;
  ```
  Show TMB and GET (rounded, `toLocaleString('pt-BR')`) or "—".
- A suggested kcal button/hint: when `get != null`, show `suggestedCalories(get, patient.objective)` (rounded) and a "Usar sugestão" action that sets the `targetCalories` field.
- `targetCalories` input (default = the suggestion when available, else empty). Macro inputs `proteinGramsPerKg` + `fatPercent`. Compute `computeMacros({ targetCalories, weightKg, proteinGramsPerKg, fatPercent })` live → show protein/fat/carb grams + kcal; if `carbGrams === 0 && targetCalories - proteinKcal - fatKcal < 0` show a warning "Proteína + gordura excedem o total".
- "Salvar meta" button → `useCreateNutritionTarget(patient.id).mutateAsync({ formula, sex, age, heightCm, weightKg, bodyFatPercentage: bf ?? undefined, activityLevel, targetCalories, proteinGramsPerKg, fatPercent })` → `toast.success('Meta salva.')`. Disabled while pending or when required inputs (sex, weight, height, age, targetCalories) are missing.
- History: `useNutritionTargets(patient.id)` → a list of prior targets (date via `toLocaleDateString('pt-BR')`, `targetCalories` kcal, `proteinGrams`/`carbGrams`/`fatGrams` g, formula label).
- pt-BR throughout; reuse `OBJECTIVE_LABELS`/`ACTIVITY_LABELS`/`GENDER_LABELS`.

- [ ] **Step 3: Tab in patient-detail**

In `apps/web/src/components/patients/patient-detail.tsx`, add after the "bioimpedancia" trigger:
```tsx
          <TabsTrigger value="metas">Metas</TabsTrigger>
```
and a content panel (only for `canEdit`, like the others):
```tsx
        <TabsContent value="metas">
          <NutritionTargetsSection patient={patient} />
        </TabsContent>
```
(Import `NutritionTargetsSection`.)

- [ ] **Step 4: Test (vitest)**

`nutrition-targets-section.test.tsx`: mock `@/lib/queries/nutrition-targets` (list returns []; create returns a fixture) + `sonner`. Render with a `PatientDetail` fixture (MALE, height 180, `activityLevel: MODERATE`, a `birthDate`, `assessments: [{ weight: 80, bodyFatPercentage: 20, ... }]`). Keep assertions **deterministic** — do NOT assert an exact TMB value (age is derived from `birthDate` via the current date, so it drifts; the exact math is covered by `energy.spec.ts`). Instead assert: (a) after prefill, TMB and GET render a number (not "—"); (b) the Katch `<option>` is `disabled` in a second render whose fixture assessment has `bodyFatPercentage: null`; (c) after filling `targetCalories` (or clicking "Usar sugestão"), clicking "Salvar meta" calls the create mutation once with a body containing `formula`, `sex: 'MALE'`, `weightKg: 80`, `proteinGramsPerKg`, `fatPercent`, `targetCalories`; (d) the history list renders a fixture row (kcal + macros). Run web test + `tsc`.

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter @nutri-plus/web test -- nutrition-targets patient-detail` (PASS) and `pnpm --filter @nutri-plus/web exec tsc --noEmit` (exit 0). Commit (`feat(web): Metas tab — GET/TMB calculators + macro goals`).

---

## Final verification

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```

Manual (web): open a patient → "Metas" tab → TMB/GET compute from the prefilled data; switching formula (Katch disabled without %GC) updates TMB; "Usar sugestão" fills the target from GET+objective; macro inputs update grams live; "Salvar meta" persists and the target appears in the history.
