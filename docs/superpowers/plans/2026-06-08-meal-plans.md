# Meal Plans (Step 04) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let nutritionists author meal plans (plan + meals + items) for their linked patients as a single nested aggregate via CRUD, and let a patient read their own plans.

**Architecture:** A new `MealPlansModule` with one `MealPlansService` and two controllers split by audience — `MealPlansController` (`/v1/meal-plans`, `@Roles(NUTRITIONIST)`) and `PatientMealPlansController` (`/v1/me/meal-plans`, `@Roles(PATIENT)`). Ownership is enforced at query time via the patient's `nutritionistId` (nutritionist side) or the caller's own `patientProfile.id` (patient side); non-owned/missing → 404 (no existence leak). Whole-plan nested writes: create/update accept the full tree and persist transactionally. Cascade deletes remove meals + items. Mirrors the existing Patient Management module exactly.

**Tech Stack:** NestJS 10.4, Prisma 7.8 (`prisma-client` generator + `@prisma/adapter-pg`), class-validator/class-transformer DTOs, `@nestjs/swagger` 8 (CLI plugin), Jest + ts-jest + Supertest, `jest-mock-extended`.

---

## Conventions for every task

- **All shell commands must be prefixed with `export PATH="$HOME/.local/bin:$PATH"`** so `pnpm` resolves (`pnpm` lives at `~/.local/bin/pnpm`).
- Run commands from the repo root unless a step says otherwise.
- Unit test run: `pnpm --filter @nutri-plus/api test -- <pattern>`
- E2E test run: `pnpm --filter @nutri-plus/api test:e2e -- <pattern>` (e2e needs the local `nutri_plus_test` Postgres; `test/setup-e2e.ts` runs `prisma migrate deploy` automatically).
- Indentation is 2 spaces; strings use single quotes (repo style).

---

## File Structure

**Create:**
- `apps/api/src/meal-plans/dto/meal-item.dto.ts` — leaf item DTO (food + macros)
- `apps/api/src/meal-plans/dto/meal.dto.ts` — meal DTO (nests items)
- `apps/api/src/meal-plans/dto/create-meal-plan.dto.ts` — create DTO (requires `patientId`, nests meals)
- `apps/api/src/meal-plans/dto/update-meal-plan.dto.ts` — update DTO (no `patientId`)
- `apps/api/src/meal-plans/meal-plans.service.ts` — all business logic + ownership
- `apps/api/src/meal-plans/meal-plans.service.spec.ts` — unit tests
- `apps/api/src/meal-plans/meal-plans.controller.ts` — nutritionist routes
- `apps/api/src/meal-plans/patient-meal-plans.controller.ts` — patient `/me` routes
- `apps/api/src/meal-plans/meal-plans.module.ts` — module wiring
- `apps/api/test/meal-plans.e2e-spec.ts` — e2e

**Modify:**
- `apps/api/prisma/schema.prisma` — add 3 models + back-relation; relax 4 columns to nullable
- `apps/api/src/app.module.ts` — register `MealPlansModule`
- `apps/api/test/setup-e2e.ts` — add meal tables to truncation order
- `apps/api/test/docs.e2e-spec.ts` — assert new paths appear in `/docs-json`

---

## Task 1: Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the back-relation to `PatientProfile`**

In `apps/api/prisma/schema.prisma`, find the `assessments BodyAssessment[]` line inside `model PatientProfile` and add the meal-plans back-relation right after it:

```prisma
  assessments    BodyAssessment[]
  mealPlans      MealPlan[]
```

- [ ] **Step 2: Append the three new models**

Add to the END of `apps/api/prisma/schema.prisma`:

```prisma
// A meal plan is a mutable, owned aggregate (plan -> meals -> items). Unlike
// BodyAssessment (immutable history, RESTRICT), child rows use onDelete: Cascade:
// deleting a plan, or replacing its tree on PATCH, removes its meals and items in
// one DB operation. title/name/foodName/quantity are nullable to support drafts
// (autosave / finish-later); only patientId is required.
model MealPlan {
  id          String   @id @default(uuid())
  patientId   String
  patient     PatientProfile @relation(fields: [patientId], references: [id])
  title       String?
  objective   String?
  aiGenerated Boolean  @default(false) // server-controlled; always false in Step 04
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  meals       Meal[]

  @@index([patientId])
}

model Meal {
  id           String   @id @default(uuid())
  mealPlanId   String
  mealPlan     MealPlan @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
  name         String?
  timeLabel    String?
  instructions String?
  order        Int      // sequence within the plan; server-assigned from array index
  createdAt    DateTime @default(now())
  items        MealItem[]

  @@index([mealPlanId])
}

model MealItem {
  id       String  @id @default(uuid())
  mealId   String
  meal     Meal    @relation(fields: [mealId], references: [id], onDelete: Cascade)
  foodName String?
  quantity String?
  calories Float?
  protein  Float?
  carbs    Float?
  fats     Float?
  order    Int     // sequence within the meal; server-assigned from array index

  @@index([mealId])
}
```

- [ ] **Step 3: Create and apply the migration (also regenerates the client)**

Run from the `apps/api` directory:

```bash
export PATH="$HOME/.local/bin:$PATH"
cd apps/api && pnpm exec prisma migrate dev --name add_meal_plans
```

Expected: a new folder `apps/api/prisma/migrations/<timestamp>_add_meal_plans/migration.sql` is created and applied; output ends with "Your database is now in sync with your schema" and "Generated Prisma Client". The SQL should `CREATE TABLE "MealPlan"`, `"Meal"`, `"MealItem"` with `ON DELETE CASCADE` on the Meal/MealItem foreign keys.

- [ ] **Step 4: Verify the project still type-checks/builds**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api build
```

Expected: build succeeds (the generated client now includes `MealPlan`, `Meal`, `MealItem` delegates).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add MealPlan/Meal/MealItem schema and migration"
```

---

## Task 2: DTOs

**Files:**
- Create: `apps/api/src/meal-plans/dto/meal-item.dto.ts`
- Create: `apps/api/src/meal-plans/dto/meal.dto.ts`
- Create: `apps/api/src/meal-plans/dto/create-meal-plan.dto.ts`
- Create: `apps/api/src/meal-plans/dto/update-meal-plan.dto.ts`

These are validated by the global `ValidationPipe` (`whitelist + transform + forbidNonWhitelisted`). `@Type` on nested arrays is required for whitelisting/validation to recurse. `order` is intentionally absent — the server assigns it.

- [ ] **Step 1: Create the item DTO**

Create `apps/api/src/meal-plans/dto/meal-item.dto.ts`:

```ts
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

// All fields optional (draft-friendly). Macros are >= 0; 0 is a valid value.
export class MealItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  foodName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  quantity?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  calories?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  protein?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  carbs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fats?: number;
}
```

- [ ] **Step 2: Create the meal DTO**

Create `apps/api/src/meal-plans/dto/meal.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MealItemDto } from './meal-item.dto';

export class MealDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timeLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MealItemDto)
  items?: MealItemDto[];
}
```

- [ ] **Step 3: Create the create DTO**

Create `apps/api/src/meal-plans/dto/create-meal-plan.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MealDto } from './meal.dto';

// patientId is the only required field — the ownership anchor. Everything else is
// optional so a nutritionist can save a partial draft and finish later. A minimal
// valid body is `{ patientId }`. aiGenerated is NOT accepted from input (the global
// ValidationPipe strips/rejects it); the server always sets false in Step 04.
export class CreateMealPlanDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  objective?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MealDto)
  meals?: MealDto[];
}
```

- [ ] **Step 4: Create the update DTO**

Create `apps/api/src/meal-plans/dto/update-meal-plan.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MealDto } from './meal.dto';

// No patientId: plan reassignment is out of MVP scope. If `meals` is present the
// whole meals/items tree is replaced; if omitted, only the provided top-level
// fields change.
export class UpdateMealPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  objective?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MealDto)
  meals?: MealDto[];
}
```

- [ ] **Step 5: Verify the DTOs compile**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/meal-plans/dto
git commit -m "feat(api): add meal plan DTOs"
```

---

## Task 3: MealPlansService (TDD)

**Files:**
- Create: `apps/api/src/meal-plans/meal-plans.service.spec.ts`
- Create: `apps/api/src/meal-plans/meal-plans.service.ts`

The service holds all logic. Methods: `createPlan`, `listPlans`, `getPlan`, `updatePlan`, `deletePlan` (nutritionist); `listMyPlans`, `getMyPlan` (patient); private helpers `nutritionistId`, `patientProfileId`, `requireOwnedPatient`, `requireOwnedPlan`, `mealsCreateInput`. The transaction in `updatePlan` is mocked by making `$transaction` invoke its callback with the same Prisma mock.

- [ ] **Step 1: Write the failing test file**

Create `apps/api/src/meal-plans/meal-plans.service.spec.ts`:

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { MealPlansService } from './meal-plans.service';
import { AuthContext } from '../auth/types/auth-context';

const FULL_TREE = {
  meals: {
    orderBy: { order: 'asc' },
    include: { items: { orderBy: { order: 'asc' } } },
  },
} as const;

function nutCtx(nutritionistId: string | null): AuthContext {
  return {
    authProviderId: 'sub-n',
    email: 'n@x.com',
    name: 'Nut',
    user: {
      id: 'user-n',
      role: 'NUTRITIONIST',
      nutritionistProfile: nutritionistId ? { id: nutritionistId } : null,
      patientProfile: null,
    } as any,
  };
}

function patCtx(patientProfileId: string | null): AuthContext {
  return {
    authProviderId: 'sub-p',
    email: 'p@x.com',
    name: 'Pat',
    user: {
      id: 'user-p',
      role: 'PATIENT',
      nutritionistProfile: null,
      patientProfile: patientProfileId ? { id: patientProfileId } : null,
    } as any,
  };
}

describe('MealPlansService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: MealPlansService;
  const ctx = nutCtx('nutri-1');

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new MealPlansService(prisma);
  });

  describe('createPlan', () => {
    it('verifies patient ownership then creates the nested tree with server-assigned order', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      prisma.mealPlan.create.mockResolvedValue({ id: 'mp1' } as any);

      const dto = {
        patientId: 'p1',
        title: 'Plan',
        meals: [{ name: 'Breakfast', items: [{ foodName: 'Egg', quantity: '2' }] }],
      } as any;
      const result = await service.createPlan(ctx, dto);

      expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', nutritionistId: 'nutri-1' },
        select: { id: true },
      });
      expect(prisma.mealPlan.create).toHaveBeenCalledWith({
        data: {
          title: 'Plan',
          patientId: 'p1',
          meals: {
            create: [
              {
                name: 'Breakfast',
                timeLabel: undefined,
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

    it('creates a minimal { patientId } draft with no meals', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      prisma.mealPlan.create.mockResolvedValue({ id: 'mp1' } as any);

      await service.createPlan(ctx, { patientId: 'p1' } as any);

      expect(prisma.mealPlan.create).toHaveBeenCalledWith({
        data: { patientId: 'p1' },
        include: FULL_TREE,
      });
    });

    it('throws NotFound and does not create when the patient is not owned', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.createPlan(ctx, { patientId: 'other' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.mealPlan.create).not.toHaveBeenCalled();
    });

    it('throws Forbidden when the caller has no nutritionist profile', async () => {
      await expect(
        service.createPlan(nutCtx(null), { patientId: 'p1' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.patientProfile.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('listPlans', () => {
    it('lists an owned patient plans newest-first (summary, no items)', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      prisma.mealPlan.findMany.mockResolvedValue([{ id: 'mp1' }] as any);

      const result = await service.listPlans(ctx, 'p1');

      expect(prisma.mealPlan.findMany).toHaveBeenCalledWith({
        where: { patientId: 'p1', patient: { nutritionistId: 'nutri-1' } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([{ id: 'mp1' }]);
    });

    it('throws NotFound when the patient is not owned', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);

      await expect(service.listPlans(ctx, 'other')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.mealPlan.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getPlan', () => {
    it('returns the full ordered tree for an owned plan', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue({ id: 'mp1' } as any);

      const result = await service.getPlan(ctx, 'mp1');

      expect(prisma.mealPlan.findFirst).toHaveBeenCalledWith({
        where: { id: 'mp1', patient: { nutritionistId: 'nutri-1' } },
        include: FULL_TREE,
      });
      expect(result).toEqual({ id: 'mp1' });
    });

    it('throws NotFound for a non-owned plan', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue(null);

      await expect(service.getPlan(ctx, 'other')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updatePlan', () => {
    it('patches only top-level fields and leaves the tree untouched when meals is omitted', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue({ id: 'mp1' } as any);
      prisma.mealPlan.update.mockResolvedValue({ id: 'mp1' } as any);

      const result = await service.updatePlan(ctx, 'mp1', { title: 'New' } as any);

      expect(prisma.mealPlan.update).toHaveBeenCalledWith({
        where: { id: 'mp1' },
        data: { title: 'New' },
        include: FULL_TREE,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.meal.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'mp1' });
    });

    it('replaces the whole tree in a transaction when meals is present', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue({ id: 'mp1' } as any);
      // Run the transaction callback against the same mock.
      prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
      prisma.meal.deleteMany.mockResolvedValue({ count: 1 } as any);
      prisma.mealPlan.update.mockResolvedValue({ id: 'mp1' } as any);

      const dto = {
        title: 'New',
        meals: [{ name: 'Lunch', items: [{ foodName: 'Rice', quantity: '100g' }] }],
      } as any;
      await service.updatePlan(ctx, 'mp1', dto);

      expect(prisma.meal.deleteMany).toHaveBeenCalledWith({
        where: { mealPlanId: 'mp1' },
      });
      expect(prisma.mealPlan.update).toHaveBeenCalledWith({
        where: { id: 'mp1' },
        data: {
          title: 'New',
          meals: {
            create: [
              {
                name: 'Lunch',
                timeLabel: undefined,
                instructions: undefined,
                order: 0,
                items: { create: [{ foodName: 'Rice', quantity: '100g', order: 0 }] },
              },
            ],
          },
        },
        include: FULL_TREE,
      });
    });

    it('throws NotFound and does not write when the plan is not owned', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.updatePlan(ctx, 'other', { title: 'x' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.mealPlan.update).not.toHaveBeenCalled();
    });
  });

  describe('deletePlan', () => {
    it('deletes an owned plan (cascade removes meals/items)', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue({ id: 'mp1' } as any);
      prisma.mealPlan.delete.mockResolvedValue({ id: 'mp1' } as any);

      const result = await service.deletePlan(ctx, 'mp1');

      expect(prisma.mealPlan.delete).toHaveBeenCalledWith({ where: { id: 'mp1' } });
      expect(result).toEqual({ id: 'mp1' });
    });

    it('throws NotFound and does not delete when the plan is not owned', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue(null);

      await expect(service.deletePlan(ctx, 'other')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.mealPlan.delete).not.toHaveBeenCalled();
    });
  });

  describe('patient read', () => {
    const pctx = patCtx('pp1');

    it('lists the patient own plans newest-first', async () => {
      prisma.mealPlan.findMany.mockResolvedValue([{ id: 'mp1' }] as any);

      const result = await service.listMyPlans(pctx);

      expect(prisma.mealPlan.findMany).toHaveBeenCalledWith({
        where: { patientId: 'pp1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([{ id: 'mp1' }]);
    });

    it('returns one own plan with the full tree', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue({ id: 'mp1' } as any);

      const result = await service.getMyPlan(pctx, 'mp1');

      expect(prisma.mealPlan.findFirst).toHaveBeenCalledWith({
        where: { id: 'mp1', patientId: 'pp1' },
        include: FULL_TREE,
      });
      expect(result).toEqual({ id: 'mp1' });
    });

    it('throws NotFound when the plan is not the patient own', async () => {
      prisma.mealPlan.findFirst.mockResolvedValue(null);

      await expect(service.getMyPlan(pctx, 'other')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws Forbidden when the caller has no patient profile', async () => {
      await expect(service.listMyPlans(patCtx(null))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test -- meal-plans.service
```

Expected: FAIL — `Cannot find module './meal-plans.service'` (the service does not exist yet).

- [ ] **Step 3: Write the service implementation**

Create `apps/api/src/meal-plans/meal-plans.service.ts`:

```ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { CreateMealPlanDto } from './dto/create-meal-plan.dto';
import { UpdateMealPlanDto } from './dto/update-meal-plan.dto';
import { MealDto } from './dto/meal.dto';

// Always return meals and their items in their stored order.
const FULL_TREE = {
  meals: {
    orderBy: { order: 'asc' },
    include: { items: { orderBy: { order: 'asc' } } },
  },
} as const;

@Injectable()
export class MealPlansService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Nutritionist surface (ownership via the patient's nutritionistId) ---

  async createPlan(ctx: AuthContext, dto: CreateMealPlanDto) {
    await this.requireOwnedPatient(ctx, dto.patientId);
    const { patientId, meals, ...top } = dto;
    return this.prisma.mealPlan.create({
      data: {
        ...top,
        patientId,
        ...(meals ? { meals: this.mealsCreateInput(meals) } : {}),
      },
      include: FULL_TREE,
    });
  }

  async listPlans(ctx: AuthContext, patientId: string) {
    await this.requireOwnedPatient(ctx, patientId);
    return this.prisma.mealPlan.findMany({
      where: { patientId, patient: { nutritionistId: this.nutritionistId(ctx) } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPlan(ctx: AuthContext, id: string) {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id, patient: { nutritionistId: this.nutritionistId(ctx) } },
      include: FULL_TREE,
    });
    if (!plan) {
      throw new NotFoundException('Meal plan not found');
    }
    return plan;
  }

  async updatePlan(ctx: AuthContext, id: string, dto: UpdateMealPlanDto) {
    await this.requireOwnedPlan(ctx, id);
    const { meals, ...top } = dto;

    // No tree provided: patch only the top-level fields.
    if (!meals) {
      return this.prisma.mealPlan.update({
        where: { id },
        data: top,
        include: FULL_TREE,
      });
    }

    // Tree provided: replace it wholesale (delete existing meals -> cascade
    // removes their items -> recreate), atomically.
    return this.prisma.$transaction(async (tx) => {
      await tx.meal.deleteMany({ where: { mealPlanId: id } });
      return tx.mealPlan.update({
        where: { id },
        data: { ...top, meals: this.mealsCreateInput(meals) },
        include: FULL_TREE,
      });
    });
  }

  async deletePlan(ctx: AuthContext, id: string) {
    await this.requireOwnedPlan(ctx, id);
    return this.prisma.mealPlan.delete({ where: { id } });
  }

  // --- Patient surface (ownership via the caller's own patientProfile.id) ---

  async listMyPlans(ctx: AuthContext) {
    return this.prisma.mealPlan.findMany({
      where: { patientId: this.patientProfileId(ctx) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyPlan(ctx: AuthContext, id: string) {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id, patientId: this.patientProfileId(ctx) },
      include: FULL_TREE,
    });
    if (!plan) {
      throw new NotFoundException('Meal plan not found');
    }
    return plan;
  }

  // --- Helpers ---

  // Server-assigns `order` from array position at every level. Items/meals are
  // never trusted to carry their own order.
  private mealsCreateInput(meals: MealDto[]) {
    return {
      create: meals.map((m, i) => ({
        name: m.name,
        timeLabel: m.timeLabel,
        instructions: m.instructions,
        order: i,
        ...(m.items
          ? {
              items: {
                create: m.items.map((it, j) => ({ ...it, order: j })),
              },
            }
          : {}),
      })),
    };
  }

  private nutritionistId(ctx: AuthContext): string {
    const id = ctx.user?.nutritionistProfile?.id;
    if (!id) {
      throw new ForbiddenException('Nutritionist profile required');
    }
    return id;
  }

  private patientProfileId(ctx: AuthContext): string {
    const id = ctx.user?.patientProfile?.id;
    if (!id) {
      throw new ForbiddenException('Patient profile required');
    }
    return id;
  }

  // A non-owned/missing id looks identical to the caller (404) so existence does
  // not leak across nutritionists.
  private async requireOwnedPatient(
    ctx: AuthContext,
    patientId: string,
  ): Promise<void> {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId: this.nutritionistId(ctx) },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
  }

  private async requireOwnedPlan(ctx: AuthContext, id: string): Promise<void> {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id, patient: { nutritionistId: this.nutritionistId(ctx) } },
      select: { id: true },
    });
    if (!plan) {
      throw new NotFoundException('Meal plan not found');
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test -- meal-plans.service
```

Expected: PASS — all `MealPlansService` tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/meal-plans/meal-plans.service.ts apps/api/src/meal-plans/meal-plans.service.spec.ts
git commit -m "feat(api): add MealPlansService with ownership and tree writes"
```

---

## Task 4: Controllers + module wiring

**Files:**
- Create: `apps/api/src/meal-plans/meal-plans.controller.ts`
- Create: `apps/api/src/meal-plans/patient-meal-plans.controller.ts`
- Create: `apps/api/src/meal-plans/meal-plans.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the nutritionist controller**

Create `apps/api/src/meal-plans/meal-plans.controller.ts`. `ParseUUIDPipe` on the `patientId` query param makes a missing/invalid value a 400 and keeps the list endpoint scoped to one patient:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { MealPlansService } from './meal-plans.service';
import { CreateMealPlanDto } from './dto/create-meal-plan.dto';
import { UpdateMealPlanDto } from './dto/update-meal-plan.dto';

@ApiTags('meal-plans')
@ApiBearerAuth()
@Controller({ path: 'meal-plans', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class MealPlansController {
  constructor(private readonly mealPlans: MealPlansService) {}

  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreateMealPlanDto) {
    return this.mealPlans.createPlan(ctx, dto);
  }

  @Get()
  list(
    @CurrentUser() ctx: AuthContext,
    @Query('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.mealPlans.listPlans(ctx, patientId);
  }

  @Get(':id')
  findOne(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.mealPlans.getPlan(ctx, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateMealPlanDto,
  ) {
    return this.mealPlans.updatePlan(ctx, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.mealPlans.deletePlan(ctx, id);
  }
}
```

- [ ] **Step 2: Create the patient controller**

Create `apps/api/src/meal-plans/patient-meal-plans.controller.ts`. The `me/meal-plans` path produces `/v1/me/meal-plans`:

```ts
import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { MealPlansService } from './meal-plans.service';

@ApiTags('meal-plans')
@ApiBearerAuth()
@Controller({ path: 'me/meal-plans', version: '1' })
@Roles(UserRole.PATIENT)
export class PatientMealPlansController {
  constructor(private readonly mealPlans: MealPlansService) {}

  @Get()
  list(@CurrentUser() ctx: AuthContext) {
    return this.mealPlans.listMyPlans(ctx);
  }

  @Get(':id')
  findOne(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.mealPlans.getMyPlan(ctx, id);
  }
}
```

- [ ] **Step 3: Create the module**

Create `apps/api/src/meal-plans/meal-plans.module.ts`. `PrismaModule` is global, so no imports are needed:

```ts
import { Module } from '@nestjs/common';
import { MealPlansController } from './meal-plans.controller';
import { PatientMealPlansController } from './patient-meal-plans.controller';
import { MealPlansService } from './meal-plans.service';

@Module({
  controllers: [MealPlansController, PatientMealPlansController],
  providers: [MealPlansService],
})
export class MealPlansModule {}
```

- [ ] **Step 4: Register the module in `AppModule`**

In `apps/api/src/app.module.ts`, add the import near the other module imports (after the `PatientsModule` import line):

```ts
import { MealPlansModule } from './meal-plans/meal-plans.module';
```

Then add `MealPlansModule` to the `imports` array, right after `PatientsModule`:

```ts
    PatientsModule,
    MealPlansModule,
```

- [ ] **Step 5: Build to verify wiring**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/meal-plans/meal-plans.controller.ts apps/api/src/meal-plans/patient-meal-plans.controller.ts apps/api/src/meal-plans/meal-plans.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): wire meal plan controllers and module"
```

---

## Task 5: E2E tests

**Files:**
- Modify: `apps/api/test/setup-e2e.ts`
- Create: `apps/api/test/meal-plans.e2e-spec.ts`

- [ ] **Step 1: Add the meal tables to the truncation order**

In `apps/api/test/setup-e2e.ts`, update the `beforeEach` block so the new tables are cleared before their parents (FK order). Replace:

```ts
beforeEach(async () => {
  // Order matters: children before parents (FK constraints).
  await prisma.bodyAssessment.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.nutritionistProfile.deleteMany();
  await prisma.user.deleteMany();
});
```

with:

```ts
beforeEach(async () => {
  // Order matters: children before parents (FK constraints).
  await prisma.mealItem.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.mealPlan.deleteMany();
  await prisma.bodyAssessment.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.nutritionistProfile.deleteMany();
  await prisma.user.deleteMany();
});
```

- [ ] **Step 2: Write the e2e test**

Create `apps/api/test/meal-plans.e2e-spec.ts`. It mirrors the bootstrap in `patients.e2e-spec.ts` and adds a standalone Prisma client used only to assert the cascade left no orphaned `MealItem` rows:

```ts
import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient, UserRole } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module';
import { signSupabaseJwt, startJwksServer, JwksServer } from './helpers/jwks';

describe('Meal Plans (e2e)', () => {
  let app: INestApplication;
  let jwks: JwksServer;
  // Standalone client for cascade assertions (the API exposes no item-level read).
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

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
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await jwks.close();
    await db.$disconnect();
  });

  beforeEach(async () => {
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

  function patientId() {
    return patient.body.patientProfile.id;
  }

  const fullTreeBody = () => ({
    patientId: patientId(),
    title: 'Cutting Plan',
    objective: 'Lose fat',
    meals: [
      {
        name: 'Breakfast',
        timeLabel: '08:00',
        items: [
          { foodName: 'Eggs', quantity: '3', protein: 18 },
          { foodName: 'Oats', quantity: '50g', carbs: 30 },
        ],
      },
      { name: 'Lunch', items: [{ foodName: 'Chicken', quantity: '200g' }] },
    ],
  });

  it('creates a full nested plan and returns it ordered', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(fullTreeBody())
      .expect(201);

    expect(res.body.title).toBe('Cutting Plan');
    expect(res.body.aiGenerated).toBe(false);
    expect(res.body.meals).toHaveLength(2);
    expect(res.body.meals[0].name).toBe('Breakfast');
    expect(res.body.meals[0].order).toBe(0);
    expect(res.body.meals[1].order).toBe(1);
    expect(res.body.meals[0].items).toHaveLength(2);
    expect(res.body.meals[0].items[0].foodName).toBe('Eggs');
    expect(res.body.meals[0].items[0].order).toBe(0);
    expect(res.body.meals[0].items[1].order).toBe(1);

    const get = await request(app.getHttpServer())
      .get(`/v1/meal-plans/${res.body.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);
    expect(get.body.meals[1].items[0].foodName).toBe('Chicken');
  });

  it('creates a minimal { patientId } draft', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: patientId() })
      .expect(201);

    expect(res.body.title).toBeNull();
    expect(res.body.meals).toEqual([]);
  });

  it('returns 404 when creating a plan for another nutritionist patient', async () => {
    await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutB.token}`)
      .send({ patientId: patientId() })
      .expect(404);
  });

  it('lists plans for an owned patient and 404s for a non-owned one', async () => {
    await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: patientId(), title: 'P1' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/v1/meal-plans?patientId=${patientId()}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].title).toBe('P1');

    await request(app.getHttpServer())
      .get(`/v1/meal-plans?patientId=${patientId()}`)
      .set('Authorization', `Bearer ${nutB.token}`)
      .expect(404);
  });

  it('returns 404 reading another nutritionist plan', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: patientId() })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/v1/meal-plans/${res.body.id}`)
      .set('Authorization', `Bearer ${nutB.token}`)
      .expect(404);
  });

  it('patches top-level fields without touching the meals tree when meals is omitted', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(fullTreeBody())
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/meal-plans/${created.body.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ title: 'Renamed' })
      .expect(200);

    expect(res.body.title).toBe('Renamed');
    expect(res.body.meals).toHaveLength(2); // tree intact
  });

  it('replaces the whole tree when meals is present in PATCH', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(fullTreeBody())
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/meal-plans/${created.body.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ meals: [{ name: 'Dinner', items: [{ foodName: 'Fish', quantity: '1' }] }] })
      .expect(200);

    expect(res.body.meals).toHaveLength(1);
    expect(res.body.meals[0].name).toBe('Dinner');
    expect(res.body.meals[0].items[0].foodName).toBe('Fish');

    // The old meals/items are gone — no orphans left behind.
    const orphanItems = await db.mealItem.count();
    expect(orphanItems).toBe(1); // only the new "Fish" item remains
  });

  it('returns 404 patching another nutritionist plan', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: patientId() })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/meal-plans/${created.body.id}`)
      .set('Authorization', `Bearer ${nutB.token}`)
      .send({ title: 'x' })
      .expect(404);
  });

  it('deletes a plan and cascades meals + items', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(fullTreeBody())
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/meal-plans/${created.body.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/v1/meal-plans/${created.body.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(404);

    expect(await db.meal.count()).toBe(0);
    expect(await db.mealItem.count()).toBe(0);
  });

  it('lets a patient read their own plans via /me/meal-plans', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(fullTreeBody())
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/v1/me/meal-plans')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    const detail = await request(app.getHttpServer())
      .get(`/v1/me/meal-plans/${created.body.id}`)
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200);
    expect(detail.body.meals).toHaveLength(2);
  });

  it('rejects role mismatches (403)', async () => {
    // Patient on the nutritionist surface.
    await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ patientId: patientId() })
      .expect(403);

    // Nutritionist on the patient surface.
    await request(app.getHttpServer())
      .get('/v1/me/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(403);
  });

  it('rejects an unknown field (400) and a missing patientId (400)', async () => {
    await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: patientId(), bogus: 'nope' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ title: 'No patient' })
      .expect(400);
  });
});
```

> **Note:** every `POST /v1/meal-plans` returns **201** and `DELETE`/`PATCH`/`GET` return **200**. Keep all create calls at `.expect(201)`.

- [ ] **Step 3: Run the e2e suite for meal plans**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test:e2e -- meal-plans
```

Expected: PASS — all Meal Plans e2e tests green.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/setup-e2e.ts apps/api/test/meal-plans.e2e-spec.ts
git commit -m "test(api): e2e for meal plan CRUD, cascade, and role scoping"
```

---

## Task 6: Swagger smoke-test coverage

**Files:**
- Modify: `apps/api/test/docs.e2e-spec.ts`

The new routes appear in `/docs-json` automatically (derived from the `@Controller`/`@Get` decorators, independent of the CLI plugin). Extend the existing path assertion.

- [ ] **Step 1: Add the meal-plan paths to the assertion**

In `apps/api/test/docs.e2e-spec.ts`, extend the `arrayContaining([...])` list in the "expected paths" test to include the new routes:

```ts
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/v1/auth/login',
        '/v1/patients',
        '/v1/patients/{id}',
        '/v1/patients/{id}/assessments',
        '/v1/meal-plans',
        '/v1/meal-plans/{id}',
        '/v1/me/meal-plans',
        '/v1/me/meal-plans/{id}',
      ]),
    );
```

- [ ] **Step 2: Run the docs e2e test**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test:e2e -- docs
```

Expected: PASS — `/docs-json` exposes all four new paths.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/docs.e2e-spec.ts
git commit -m "test(api): assert meal plan paths in OpenAPI doc"
```

---

## Task 7: Full suite verification

- [ ] **Step 1: Run the entire unit suite**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test
```

Expected: PASS — all unit tests green (existing + new `MealPlansService`).

- [ ] **Step 2: Run the entire e2e suite**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test:e2e
```

Expected: PASS — all e2e specs green (auth, patients, docs, meal-plans).

- [ ] **Step 3: Lint**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api lint
```

Expected: no errors.

---

## Self-review checklist (for the implementer to confirm at the end)

- [ ] **Spec coverage:** nested whole-plan create ✓ (Task 3/5), patient read ✓ (Task 3/5), draft-friendly nullable columns + `patientId`-only-required ✓ (Task 1/2/5), PATCH tree-replace ✓ (Task 3/5), cascade delete ✓ (Task 1/5), ownership 404-no-leak ✓ (Task 3/5), role 403 ✓ (Task 5), `order` server-assigned ✓ (Task 3/5), Swagger paths ✓ (Task 6).
- [ ] **No placeholders:** every step has real code/commands.
- [ ] **Naming consistency:** service methods (`createPlan`, `listPlans`, `getPlan`, `updatePlan`, `deletePlan`, `listMyPlans`, `getMyPlan`) match between the service (Task 3), the controllers (Task 4), and the unit tests (Task 3). `FULL_TREE` shape identical in service and unit test. `mealsCreateInput` used by both `createPlan` and `updatePlan`.
- [ ] **POST returns 201** in every e2e create call.
```
