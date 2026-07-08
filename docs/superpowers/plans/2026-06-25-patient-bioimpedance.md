# Patient bioimpedance (Bioimpedância) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the patient detail page, let a nutritionist record body-assessment (bioimpedance) measurements over time and visualize evolution — view summary, a trend chart, and a history table; create, edit, and delete assessments — while employees see it read-only.

**Architecture:** Two new nutritionist-only backend endpoints (`PATCH`/`DELETE` assessment) over the existing `BodyAssessment` model + `createAssessment`/`listAssessments`. The web layer (shared-types, `browserApiFetch` API funcs, React Query hooks, zod) feeds a `BioimpedanceSection` (summary cards → Recharts trend chart with a metric selector → compact history table) and an `AssessmentDialog` (create/edit/delete). Write affordances are gated by the `canEdit` prop already on `PatientDetail`.

**Tech Stack:** NestJS + Prisma (apps/api, Jest); Next.js 16 + React 19 + React Query + react-hook-form + zod + **Recharts** (apps/web, Vitest + RTL); `@nutri-plus/shared-types`.

## Global Constraints

- **Branch:** `feat/patient-bioimpedance` (spec committed there), stacked on `feat/employees-ui`. Do all work on this branch.
- **This is UI + two endpoints, not a data-model change.** The `BodyAssessment` model, `CreateAssessmentDto`, `POST`/`GET` routes, and `createAssessment`/`listAssessments` already exist. No Prisma migration.
- **Tenancy:** every assessment operation goes through `requireOwned(ctx, patientId)`; a non-owned patient OR an `assessmentId` not belonging to the patient both yield `404` (`NotFoundException`).
- **Roles:** `PATCH`/`DELETE`/`POST` assessment are nutritionist-only (inherit the controller's `@Roles(NUTRITIONIST)`); `GET` stays `@Roles(NUTRITIONIST, EMPLOYEE)`. The web gates writes with `canEdit` (= `canManagePatients(role)`, already passed to `PatientDetail`).
- **Quotes:** SINGLE quotes for NEW files; match existing style when editing. Verified single-quoted: `patients.controller.ts`, `patients.service.ts`, `patients.service.spec.ts`, `create-assessment.dto.ts`, `patient.ts`, `index.ts`, `patient-detail.tsx`, `lib/validation/patient.ts`, `category-dialog.tsx`. 
- **pt-BR** for all user-facing copy and validation messages.
- **At least one numeric metric** is required to save an assessment (date/notes alone are not enough).
- **Recharts is mocked in Vitest** (its chart components render simple placeholders) to avoid `ResponsiveContainer`/SVG resize issues under jsdom.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Backend — `PATCH` + `DELETE` assessment

**Files:**
- Create: `apps/api/src/patients/dto/update-assessment.dto.ts`
- Modify: `apps/api/src/patients/patients.service.ts` (add `updateAssessment`, `removeAssessment`)
- Modify: `apps/api/src/patients/patients.controller.ts` (add the two routes)
- Test: `apps/api/src/patients/patients.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `requireOwned(ctx, id)`, `this.prisma.bodyAssessment.{findFirst,update,delete}`, `NotFoundException`, `CreateAssessmentDto`.
- Produces: `updateAssessment(ctx, patientId, assessmentId, dto): Promise<BodyAssessment>`; `removeAssessment(ctx, patientId, assessmentId): Promise<void>`; routes `PATCH /v1/patients/:id/assessments/:assessmentId` and `DELETE …` (204).

- [ ] **Step 1: Write the failing service tests**

In `apps/api/src/patients/patients.service.spec.ts`, add inside `describe('PatientsService', …)` (after the `lists assessments newest-first` test):

```ts
it('updates an owned assessment', async () => {
  prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
  prisma.bodyAssessment.findFirst.mockResolvedValue({ id: 'a1' } as any);
  prisma.bodyAssessment.update.mockResolvedValue({ id: 'a1', weight: 80 } as any);

  const result = await service.updateAssessment(ctx, 'p1', 'a1', { weight: 80 } as any);

  expect(prisma.bodyAssessment.findFirst).toHaveBeenCalledWith({
    where: { id: 'a1', patientId: 'p1' },
    select: { id: true },
  });
  expect(prisma.bodyAssessment.update).toHaveBeenCalledWith({
    where: { id: 'a1' },
    data: { weight: 80 },
  });
  expect(result).toEqual({ id: 'a1', weight: 80 });
});

it('does not update an assessment for a non-owned patient', async () => {
  prisma.patientProfile.findFirst.mockResolvedValue(null);
  await expect(
    service.updateAssessment(ctx, 'other', 'a1', { weight: 80 } as any),
  ).rejects.toBeInstanceOf(NotFoundException);
  expect(prisma.bodyAssessment.update).not.toHaveBeenCalled();
});

it('throws when the assessment does not belong to the patient', async () => {
  prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
  prisma.bodyAssessment.findFirst.mockResolvedValue(null);
  await expect(
    service.updateAssessment(ctx, 'p1', 'a1', { weight: 80 } as any),
  ).rejects.toBeInstanceOf(NotFoundException);
  expect(prisma.bodyAssessment.update).not.toHaveBeenCalled();
});

it('removes an owned assessment', async () => {
  prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
  prisma.bodyAssessment.findFirst.mockResolvedValue({ id: 'a1' } as any);
  prisma.bodyAssessment.delete.mockResolvedValue({ id: 'a1' } as any);

  await service.removeAssessment(ctx, 'p1', 'a1');

  expect(prisma.bodyAssessment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
});

it('does not remove an assessment that does not belong to the patient', async () => {
  prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
  prisma.bodyAssessment.findFirst.mockResolvedValue(null);
  await expect(service.removeAssessment(ctx, 'p1', 'a1')).rejects.toBeInstanceOf(
    NotFoundException,
  );
  expect(prisma.bodyAssessment.delete).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/api test -- patients.service`
Expected: FAIL — `service.updateAssessment is not a function`.

- [ ] **Step 3: Create the DTO**

Create `apps/api/src/patients/dto/update-assessment.dto.ts`:

```ts
import { CreateAssessmentDto } from './create-assessment.dto';

// Same shape as creation — every field optional. Inherits all validators.
export class UpdateAssessmentDto extends CreateAssessmentDto {}
```

- [ ] **Step 4: Add the service methods**

In `apps/api/src/patients/patients.service.ts`, add the import next to the existing assessment DTO import:

```ts
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
```

Add these methods immediately after `listAssessments` (before the private `requireOwned`):

```ts
  async updateAssessment(
    ctx: AuthContext,
    patientId: string,
    assessmentId: string,
    dto: UpdateAssessmentDto,
  ) {
    await this.requireOwned(ctx, patientId);
    await this.requireAssessment(patientId, assessmentId);
    return this.prisma.bodyAssessment.update({
      where: { id: assessmentId },
      data: dto,
    });
  }

  async removeAssessment(
    ctx: AuthContext,
    patientId: string,
    assessmentId: string,
  ): Promise<void> {
    await this.requireOwned(ctx, patientId);
    await this.requireAssessment(patientId, assessmentId);
    await this.prisma.bodyAssessment.delete({ where: { id: assessmentId } });
  }

  // The assessment must belong to the (already-owned) patient; otherwise 404.
  private async requireAssessment(patientId: string, assessmentId: string): Promise<void> {
    const assessment = await this.prisma.bodyAssessment.findFirst({
      where: { id: assessmentId, patientId },
      select: { id: true },
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
  }
```

- [ ] **Step 5: Add the controller routes**

In `apps/api/src/patients/patients.controller.ts`, extend the `@nestjs/common` import to include `Delete`, `HttpCode`, `HttpStatus`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
```

Add the DTO import next to the create one:

```ts
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
```

Add the two routes after `listAssessments`:

```ts
  @Patch(':id/assessments/:assessmentId')
  updateAssessment(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Param('assessmentId') assessmentId: string,
    @Body() dto: UpdateAssessmentDto,
  ) {
    return this.patients.updateAssessment(ctx, id, assessmentId, dto);
  }

  @Delete(':id/assessments/:assessmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAssessment(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Param('assessmentId') assessmentId: string,
  ) {
    return this.patients.removeAssessment(ctx, id, assessmentId);
  }
```

(Both inherit the controller-level `@Roles(UserRole.NUTRITIONIST)` — no per-method override — so employees are blocked.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/api test -- patients.service`
Expected: PASS — all `PatientsService` tests green (including the five new ones).

- [ ] **Step 7: Build the API**

Run: `pnpm --filter @nutri-plus/api build`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/patients
git commit -m "feat(api): add PATCH/DELETE patient assessment endpoints

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: shared-types — `BodyAssessment` + typed `PatientDetail.assessments`

**Files:**
- Create: `packages/shared-types/src/v1/assessment.ts`
- Modify: `packages/shared-types/src/v1/index.ts`
- Modify: `packages/shared-types/src/v1/patient.ts`

**Interfaces:**
- Produces: `BodyAssessment`, `CreateAssessmentRequest`, `UpdateAssessmentRequest` (web consumes these in Tasks 3–6); `PatientDetail.assessments: BodyAssessment[]`.

**Note:** types-only package, no runtime tests — verification is the build + the emitted declarations.

- [ ] **Step 1: Create the assessment types**

Create `packages/shared-types/src/v1/assessment.ts`:

```ts
// Dates are ISO strings over the wire. All metrics are nullable in storage.
export interface BodyAssessment {
  id: string;
  patientId: string;
  assessmentDate: string;
  weight: number | null;
  bodyFatPercentage: number | null;
  muscleMass: number | null;
  leanMass: number | null;
  visceralFat: number | null;
  basalMetabolicRate: number | null;
  bodyWaterPercentage: number | null;
  boneMass: number | null;
  metabolicAge: number | null;
  waistCircumference: number | null;
  hipCircumference: number | null;
  chestCircumference: number | null;
  armCircumference: number | null;
  thighCircumference: number | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateAssessmentRequest {
  assessmentDate?: string;
  weight?: number;
  bodyFatPercentage?: number;
  muscleMass?: number;
  leanMass?: number;
  visceralFat?: number;
  basalMetabolicRate?: number;
  bodyWaterPercentage?: number;
  boneMass?: number;
  metabolicAge?: number;
  waistCircumference?: number;
  hipCircumference?: number;
  chestCircumference?: number;
  armCircumference?: number;
  thighCircumference?: number;
  notes?: string;
}

export type UpdateAssessmentRequest = CreateAssessmentRequest;
```

- [ ] **Step 2: Export from the barrel**

In `packages/shared-types/src/v1/index.ts`, add at the end:

```ts
export * from './assessment';
```

- [ ] **Step 3: Type `PatientDetail.assessments`**

In `packages/shared-types/src/v1/patient.ts`, add the import at the top:

```ts
import type { BodyAssessment } from './assessment';
```

Replace the `PatientDetail` interface (currently `assessments: unknown[]`) with:

```ts
export interface PatientDetail extends PatientSummary {
  assessments: BodyAssessment[];
}
```

- [ ] **Step 4: Build and verify the declarations**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: exits 0.

Run: `grep -E 'interface BodyAssessment|CreateAssessmentRequest|UpdateAssessmentRequest' packages/shared-types/dist/index.d.ts`
Expected: all three present.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/v1/assessment.ts packages/shared-types/src/v1/index.ts packages/shared-types/src/v1/patient.ts packages/shared-types/dist
git commit -m "feat(shared-types): add BodyAssessment types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Web — assessments API funcs + React Query hooks

**Files:**
- Create: `apps/web/src/lib/api/assessments.ts`
- Create: `apps/web/src/lib/api/assessments.test.ts`
- Create: `apps/web/src/lib/queries/assessments.ts`

**Interfaces:**
- Consumes: `browserApiFetch`; `BodyAssessment`, `CreateAssessmentRequest`, `UpdateAssessmentRequest` (Task 2).
- Produces: `listAssessments(patientId)`, `createAssessment(patientId, body)`, `updateAssessment(patientId, id, body)`, `deleteAssessment(patientId, id)`; hooks `useAssessments(patientId)` (key `['assessments', patientId]`), `useCreateAssessment(patientId)` (mutationFn `body`), `useUpdateAssessment(patientId)` (mutationFn `{ id, body }`), `useDeleteAssessment(patientId)` (mutationFn `id`). Mutations invalidate `['assessments', patientId]`.

- [ ] **Step 1: Write the failing API-function tests**

Create `apps/web/src/lib/api/assessments.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiFetch: (...args: unknown[]) => browserApiFetch(...args),
}));

import {
  listAssessments,
  createAssessment,
  updateAssessment,
  deleteAssessment,
} from './assessments';

beforeEach(() => browserApiFetch.mockReset().mockResolvedValue(undefined));

describe('assessments API', () => {
  it('lists with a GET to the patient assessments path', async () => {
    await listAssessments('p1');
    expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1/assessments');
  });
  it('creates with a POST and body', async () => {
    await createAssessment('p1', { weight: 80 });
    expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1/assessments', {
      method: 'POST',
      body: { weight: 80 },
    });
  });
  it('updates with a PATCH to the assessment path', async () => {
    await updateAssessment('p1', 'a1', { weight: 81 });
    expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1/assessments/a1', {
      method: 'PATCH',
      body: { weight: 81 },
    });
  });
  it('deletes with a DELETE to the assessment path', async () => {
    await deleteAssessment('p1', 'a1');
    expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1/assessments/a1', {
      method: 'DELETE',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/web test -- assessments.test`
Expected: FAIL — cannot resolve `./assessments`.

- [ ] **Step 3: Create the API functions**

Create `apps/web/src/lib/api/assessments.ts`:

```ts
import type {
  BodyAssessment,
  CreateAssessmentRequest,
  UpdateAssessmentRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listAssessments(patientId: string): Promise<BodyAssessment[]> {
  return browserApiFetch<BodyAssessment[]>(`/patients/${patientId}/assessments`);
}

export function createAssessment(
  patientId: string,
  body: CreateAssessmentRequest,
): Promise<BodyAssessment> {
  return browserApiFetch<BodyAssessment>(`/patients/${patientId}/assessments`, {
    method: 'POST',
    body,
  });
}

export function updateAssessment(
  patientId: string,
  id: string,
  body: UpdateAssessmentRequest,
): Promise<BodyAssessment> {
  return browserApiFetch<BodyAssessment>(`/patients/${patientId}/assessments/${id}`, {
    method: 'PATCH',
    body,
  });
}

export function deleteAssessment(patientId: string, id: string): Promise<void> {
  return browserApiFetch<void>(`/patients/${patientId}/assessments/${id}`, {
    method: 'DELETE',
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/web test -- assessments.test`
Expected: PASS — all four green.

- [ ] **Step 5: Create the query hooks**

Create `apps/web/src/lib/queries/assessments.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateAssessmentRequest, UpdateAssessmentRequest } from '@nutri-plus/shared-types';
import {
  createAssessment,
  deleteAssessment,
  listAssessments,
  updateAssessment,
} from '@/lib/api/assessments';

export function useAssessments(patientId: string) {
  return useQuery({
    queryKey: ['assessments', patientId],
    queryFn: () => listAssessments(patientId),
    enabled: Boolean(patientId),
  });
}

function useInvalidateAssessments(patientId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['assessments', patientId] });
}

export function useCreateAssessment(patientId: string) {
  const invalidate = useInvalidateAssessments(patientId);
  return useMutation({
    mutationFn: (body: CreateAssessmentRequest) => createAssessment(patientId, body),
    onSuccess: invalidate,
  });
}

export function useUpdateAssessment(patientId: string) {
  const invalidate = useInvalidateAssessments(patientId);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAssessmentRequest }) =>
      updateAssessment(patientId, id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteAssessment(patientId: string) {
  const invalidate = useInvalidateAssessments(patientId);
  return useMutation({
    mutationFn: (id: string) => deleteAssessment(patientId, id),
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/api/assessments.ts apps/web/src/lib/api/assessments.test.ts apps/web/src/lib/queries/assessments.ts
git commit -m "feat(web): add assessments API client and React Query hooks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Web — assessment validation schema

**Files:**
- Create: `apps/web/src/lib/validation/assessment.ts`
- Test: `apps/web/src/lib/validation/assessment.test.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces: `assessmentSchema` and `AssessmentValues` (the dialog uses both in Task 5). Numeric metrics optional/coerced; `assessmentDate` optional + not-future; `notes` ≤ 2000; a top-level refine requires at least one numeric metric.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/validation/assessment.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { assessmentSchema } from './assessment';

describe('assessmentSchema', () => {
  it('accepts a single numeric metric', () => {
    expect(assessmentSchema.safeParse({ weight: '80' }).success).toBe(true);
  });
  it('coerces metric strings to numbers', () => {
    const r = assessmentSchema.safeParse({ weight: '80.5' });
    expect(r.success && r.data.weight).toBe(80.5);
  });
  it('rejects an empty payload (no metric)', () => {
    expect(assessmentSchema.safeParse({}).success).toBe(false);
  });
  it('rejects when only date/notes are present', () => {
    expect(
      assessmentSchema.safeParse({ assessmentDate: '2026-01-01', notes: 'oi' }).success,
    ).toBe(false);
  });
  it('rejects a future assessmentDate', () => {
    expect(assessmentSchema.safeParse({ weight: '80', assessmentDate: '2999-01-01' }).success).toBe(false);
  });
  it('rejects a non-positive weight', () => {
    expect(assessmentSchema.safeParse({ weight: '0' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/web test -- assessment.test`
Expected: FAIL — cannot resolve `./assessment`.

- [ ] **Step 3: Create the schema**

Create `apps/web/src/lib/validation/assessment.ts`:

```ts
import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const optNonNegative = z.preprocess(
  emptyToUndefined,
  z.coerce.number().min(0, 'Não pode ser negativo.').optional(),
);
const optPositive = z.preprocess(
  emptyToUndefined,
  z.coerce.number().positive('Deve ser maior que zero.').optional(),
);
const optInt = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int('Deve ser um número inteiro.').min(0, 'Não pode ser negativo.').optional(),
);

// The 15 measurable fields; date/notes alone do not count as "a metric".
const NUMERIC_KEYS = [
  'weight',
  'bodyFatPercentage',
  'muscleMass',
  'leanMass',
  'visceralFat',
  'basalMetabolicRate',
  'bodyWaterPercentage',
  'boneMass',
  'metabolicAge',
  'waistCircumference',
  'hipCircumference',
  'chestCircumference',
  'armCircumference',
  'thighCircumference',
] as const;

export const assessmentSchema = z
  .object({
    assessmentDate: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .refine(
          (v) => v.slice(0, 10) <= new Date().toISOString().slice(0, 10),
          'A data não pode ser futura.',
        )
        .optional(),
    ),
    weight: optPositive,
    bodyFatPercentage: optNonNegative,
    muscleMass: optNonNegative,
    leanMass: optNonNegative,
    visceralFat: optNonNegative,
    basalMetabolicRate: optPositive,
    bodyWaterPercentage: optNonNegative,
    boneMass: optNonNegative,
    metabolicAge: optInt,
    waistCircumference: optNonNegative,
    hipCircumference: optNonNegative,
    chestCircumference: optNonNegative,
    armCircumference: optNonNegative,
    thighCircumference: optNonNegative,
    notes: z.preprocess(
      emptyToUndefined,
      z.string().max(2000, 'Máximo de 2000 caracteres.').optional(),
    ),
  })
  .refine((v) => NUMERIC_KEYS.some((k) => v[k] != null), {
    message: 'Informe ao menos uma métrica.',
    path: ['weight'],
  });

export type AssessmentValues = z.infer<typeof assessmentSchema>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/web test -- assessment.test`
Expected: PASS — all six green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/validation/assessment.ts apps/web/src/lib/validation/assessment.test.ts
git commit -m "feat(web): add assessment validation schema

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Web — `AssessmentDialog` (create / edit / delete)

**Files:**
- Create: `apps/web/src/components/patients/assessment-dialog.tsx`
- Test: `apps/web/src/components/patients/assessment-dialog.test.tsx`

**Interfaces:**
- Consumes: `assessmentSchema`/`AssessmentValues` (Task 4); `useCreateAssessment`/`useUpdateAssessment`/`useDeleteAssessment` (Task 3); `BodyAssessment` (Task 2); `ApiError`; the shadcn `Dialog*`, `Form*`, `Input`, `Textarea`, `Button`.
- Produces: `AssessmentDialog({ open, onOpenChange, patientId, assessment? })`. Create when `assessment` absent; edit when present (with inline-confirm delete).

**Pattern source:** mirror `apps/web/src/components/agenda/category-dialog.tsx` (and its test).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/patients/assessment-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const createMut = vi.fn();
const updateMut = vi.fn();
const deleteMut = vi.fn();

vi.mock('@/lib/queries/assessments', () => ({
  useCreateAssessment: () => ({ mutateAsync: createMut, isPending: false }),
  useUpdateAssessment: () => ({ mutateAsync: updateMut, isPending: false }),
  useDeleteAssessment: () => ({ mutateAsync: deleteMut, isPending: false }),
}));

import { AssessmentDialog } from './assessment-dialog';

const onOpenChange = vi.fn();

const assessment = {
  id: 'a1',
  patientId: 'p1',
  assessmentDate: '2026-05-12T00:00:00.000Z',
  weight: 78.2,
  bodyFatPercentage: 22,
  muscleMass: 34,
  leanMass: 60,
  visceralFat: null,
  basalMetabolicRate: 1680,
  bodyWaterPercentage: null,
  boneMass: null,
  metabolicAge: null,
  waistCircumference: 82,
  hipCircumference: null,
  chestCircumference: null,
  armCircumference: null,
  thighCircumference: null,
  notes: null,
  createdAt: '2026-05-12T00:00:00.000Z',
};

beforeEach(() => {
  createMut.mockReset().mockResolvedValue({});
  updateMut.mockReset().mockResolvedValue({});
  deleteMut.mockReset().mockResolvedValue(undefined);
  onOpenChange.mockReset();
});

describe('AssessmentDialog', () => {
  it('create: submits the typed weight', async () => {
    render(<AssessmentDialog open onOpenChange={onOpenChange} patientId="p1" />);
    await userEvent.type(screen.getByLabelText(/peso/i), '80');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(createMut).toHaveBeenCalledTimes(1));
    expect(createMut.mock.calls[0][0].weight).toBe(80);
  });

  it('edit: prefills and updates with the assessment id', async () => {
    render(<AssessmentDialog open onOpenChange={onOpenChange} patientId="p1" assessment={assessment} />);
    expect(screen.getByLabelText(/peso/i)).toHaveValue(78.2);
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1));
    expect(updateMut.mock.calls[0][0].id).toBe('a1');
  });

  it('edit: deleting requires inline confirmation then removes', async () => {
    render(<AssessmentDialog open onOpenChange={onOpenChange} patientId="p1" assessment={assessment} />);
    await userEvent.click(screen.getByRole('button', { name: /excluir/i }));
    expect(screen.getByText(/não pode ser desfeita/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^excluir$/i }));
    await waitFor(() => expect(deleteMut).toHaveBeenCalledWith('a1'));
  });

  it('shows the "ao menos uma métrica" error on an empty submit', async () => {
    render(<AssessmentDialog open onOpenChange={onOpenChange} patientId="p1" />);
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    expect(await screen.findByText(/ao menos uma métrica/i)).toBeInTheDocument();
    expect(createMut).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/web test -- assessment-dialog`
Expected: FAIL — cannot resolve `./assessment-dialog`.

- [ ] **Step 3: Create the dialog**

Create `apps/web/src/components/patients/assessment-dialog.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { BodyAssessment } from '@nutri-plus/shared-types';
import { assessmentSchema, type AssessmentValues } from '@/lib/validation/assessment';
import {
  useCreateAssessment,
  useDeleteAssessment,
  useUpdateAssessment,
} from '@/lib/queries/assessments';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type NumField = { name: keyof AssessmentValues; label: string };

const COMPOSITION: NumField[] = [
  { name: 'weight', label: 'Peso (kg)' },
  { name: 'bodyFatPercentage', label: '% Gordura' },
  { name: 'muscleMass', label: 'Massa muscular (kg)' },
  { name: 'leanMass', label: 'Massa magra (kg)' },
  { name: 'visceralFat', label: 'Gordura visceral' },
  { name: 'basalMetabolicRate', label: 'TMB (kcal)' },
  { name: 'bodyWaterPercentage', label: '% Água' },
  { name: 'boneMass', label: 'Massa óssea (kg)' },
  { name: 'metabolicAge', label: 'Idade metabólica' },
];

const CIRCUMFERENCES: NumField[] = [
  { name: 'waistCircumference', label: 'Cintura (cm)' },
  { name: 'hipCircumference', label: 'Quadril (cm)' },
  { name: 'chestCircumference', label: 'Peito (cm)' },
  { name: 'armCircumference', label: 'Braço (cm)' },
  { name: 'thighCircumference', label: 'Coxa (cm)' },
];

const NUM_NAMES = [...COMPOSITION, ...CIRCUMFERENCES].map((f) => f.name);

function defaults(assessment?: BodyAssessment): AssessmentValues {
  const str = (v: number | null | undefined) => (v == null ? '' : String(v));
  const base: Record<string, string> = {
    assessmentDate: assessment?.assessmentDate ? assessment.assessmentDate.slice(0, 10) : '',
    notes: assessment?.notes ?? '',
  };
  for (const name of NUM_NAMES) {
    base[name] = str(assessment?.[name as keyof BodyAssessment] as number | null | undefined);
  }
  return base as unknown as AssessmentValues;
}

export function AssessmentDialog({
  open,
  onOpenChange,
  patientId,
  assessment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  assessment?: BodyAssessment;
}) {
  const create = useCreateAssessment(patientId);
  const update = useUpdateAssessment(patientId);
  const remove = useDeleteAssessment(patientId);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const form = useForm<AssessmentValues>({
    resolver: zodResolver(assessmentSchema) as Resolver<AssessmentValues>,
    defaultValues: defaults(assessment),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaults(assessment));
      setFormError(null);
      setConfirmingDelete(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assessment]);

  async function onSubmit(values: AssessmentValues) {
    setFormError(null);
    try {
      if (assessment) {
        await update.mutateAsync({ id: assessment.id, body: values });
        toast.success('Avaliação atualizada.');
      } else {
        await create.mutateAsync(values);
        toast.success('Avaliação registrada.');
      }
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? 'Não foi possível salvar a avaliação.'
          : 'Erro inesperado ao salvar a avaliação.';
      setFormError(message);
      toast.error(message);
    }
  }

  async function onDelete() {
    if (!assessment) return;
    try {
      await remove.mutateAsync(assessment.id);
      toast.success('Avaliação excluída.');
      onOpenChange(false);
    } catch {
      toast.error('Não foi possível excluir a avaliação.');
    }
  }

  const pending =
    form.formState.isSubmitting || create.isPending || update.isPending || remove.isPending;

  function renderNumber({ name, label }: NumField) {
    return (
      <FormField
        key={name}
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Input type="number" inputMode="decimal" step="any" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{assessment ? 'Editar avaliação' : 'Nova avaliação'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="assessmentDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data da avaliação</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Composição corporal
              </p>
              <div className="grid gap-3 sm:grid-cols-2">{COMPOSITION.map(renderNumber)}</div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Circunferências
              </p>
              <div className="grid gap-3 sm:grid-cols-2">{CIRCUMFERENCES.map(renderNumber)}</div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            {confirmingDelete ? (
              <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <p className="mr-auto text-sm text-muted-foreground">
                  Excluir esta avaliação? Esta ação não pode ser desfeita.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={remove.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={onDelete}
                  disabled={remove.isPending}
                >
                  {remove.isPending ? 'Excluindo…' : 'Excluir'}
                </Button>
              </DialogFooter>
            ) : (
              <DialogFooter className="justify-end">
                {assessment && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mr-auto rounded-full text-destructive"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={pending}
                  >
                    Excluir
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" className="rounded-full" disabled={pending}>
                  {pending ? 'Salvando…' : 'Salvar'}
                </Button>
              </DialogFooter>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/web test -- assessment-dialog`
Expected: PASS — all four green. (The empty-submit refine error renders under the "Peso" field via `path: ['weight']`; `screen.findByText(/ao menos uma métrica/i)` finds it.)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/patients/assessment-dialog.tsx apps/web/src/components/patients/assessment-dialog.test.tsx
git commit -m "feat(web): add AssessmentDialog for create/edit/delete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Web — `BioimpedanceSection` (summary + chart + table) + Recharts + wiring

**Files:**
- Modify: `apps/web/package.json` (add `recharts` via `pnpm add`)
- Modify: `apps/web/src/components/patients/bioimpedance-section.tsx` (replace placeholder)
- Modify: `apps/web/src/components/patients/patient-detail.tsx` (pass `patientId` + `canEdit`)
- Test: `apps/web/src/components/patients/bioimpedance-section.test.tsx` (new)

**Interfaces:**
- Consumes: `useAssessments` (Task 3); `AssessmentDialog` (Task 5); `BodyAssessment` (Task 2); `Recharts`.
- Produces: `BioimpedanceSection({ patientId, canEdit = true })` — summary cards (latest) + a Recharts trend chart with a metric selector + a compact history table; create/edit/delete via `AssessmentDialog`, all write affordances gated by `canEdit`.

- [ ] **Step 1: Add the Recharts dependency**

Run: `pnpm --filter @nutri-plus/web add recharts`
Expected: `recharts` appears under `dependencies` in `apps/web/package.json`; lockfile updates; install succeeds.

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/components/patients/bioimpedance-section.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useAssessments = vi.fn();
vi.mock('@/lib/queries/assessments', () => ({
  useAssessments: () => useAssessments(),
  useCreateAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Recharts renders SVG via ResponsiveContainer (no layout in jsdom) — stub it.
// LineChart echoes its `data` so tests can assert the charted series.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="chart">{children}</div>
  ),
  LineChart: ({ data, children }: { data: unknown; children: ReactNode }) => (
    <div data-testid="chart-data">
      {JSON.stringify(data)}
      {children}
    </div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

import { BioimpedanceSection } from './bioimpedance-section';

function assessment(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    patientId: 'p1',
    assessmentDate: '2026-05-12T00:00:00.000Z',
    weight: 78.2,
    bodyFatPercentage: 22,
    muscleMass: 34,
    leanMass: 60,
    visceralFat: null,
    basalMetabolicRate: 1680,
    bodyWaterPercentage: null,
    boneMass: null,
    metabolicAge: null,
    waistCircumference: 82,
    hipCircumference: null,
    chestCircumference: null,
    armCircumference: null,
    thighCircumference: null,
    notes: null,
    createdAt: '2026-05-12T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => useAssessments.mockReset());

describe('BioimpedanceSection', () => {
  it('shows the loading skeleton', () => {
    useAssessments.mockReturnValue({ isLoading: true });
    render(<BioimpedanceSection patientId="p1" />);
    expect(screen.getByTestId('bio-loading')).toBeInTheDocument();
  });

  it('shows the empty state with a CTA when canEdit', () => {
    useAssessments.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<BioimpedanceSection patientId="p1" canEdit />);
    expect(screen.getByText(/nenhuma avaliação ainda/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /registrar avaliação/i })).toBeInTheDocument();
  });

  it('renders summary cards and the history table', () => {
    useAssessments.mockReturnValue({ isLoading: false, isError: false, data: [assessment()] });
    render(<BioimpedanceSection patientId="p1" canEdit />);
    expect(screen.getAllByText(/78,2/).length).toBeGreaterThan(0); // weight in summary + table
    expect(screen.getByRole('button', { name: /nova avaliação/i })).toBeInTheDocument();
  });

  it('switches the charted metric when a chip is clicked', async () => {
    useAssessments.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        assessment(),
        assessment({ id: 'a2', assessmentDate: '2026-04-12T00:00:00.000Z', weight: 80, bodyFatPercentage: 24 }),
      ],
    });
    render(<BioimpedanceSection patientId="p1" canEdit />);
    // default metric = weight: series contains the weights
    expect(screen.getByTestId('chart-data').textContent).toContain('80');
    await userEvent.click(screen.getByRole('button', { name: '% Gordura' }));
    // now the body-fat values are charted
    expect(screen.getByTestId('chart-data').textContent).toContain('24');
  });

  it('hides write affordances for employees (canEdit=false)', () => {
    useAssessments.mockReturnValue({ isLoading: false, isError: false, data: [assessment()] });
    render(<BioimpedanceSection patientId="p1" canEdit={false} />);
    expect(screen.queryByRole('button', { name: /nova avaliação/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- bioimpedance-section`
Expected: FAIL — the current placeholder has none of these elements.

- [ ] **Step 4: Implement the section**

Replace the entire contents of `apps/web/src/components/patients/bioimpedance-section.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BodyAssessment } from '@nutri-plus/shared-types';
import { useAssessments } from '@/lib/queries/assessments';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AssessmentDialog } from '@/components/patients/assessment-dialog';

type MetricKey = Extract<
  keyof BodyAssessment,
  | 'weight'
  | 'bodyFatPercentage'
  | 'muscleMass'
  | 'leanMass'
  | 'visceralFat'
  | 'basalMetabolicRate'
  | 'bodyWaterPercentage'
  | 'waistCircumference'
  | 'hipCircumference'
>;

const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'weight', label: 'Peso' },
  { key: 'bodyFatPercentage', label: '% Gordura' },
  { key: 'muscleMass', label: 'Massa muscular' },
  { key: 'leanMass', label: 'Massa magra' },
  { key: 'visceralFat', label: 'Gordura visceral' },
  { key: 'basalMetabolicRate', label: 'TMB' },
  { key: 'bodyWaterPercentage', label: '% Água' },
  { key: 'waistCircumference', label: 'Cintura' },
  { key: 'hipCircumference', label: 'Quadril' },
];

const SUMMARY: { key: MetricKey; label: string }[] = [
  { key: 'weight', label: 'Peso (kg)' },
  { key: 'bodyFatPercentage', label: '% Gordura' },
  { key: 'leanMass', label: 'Massa magra' },
  { key: 'basalMetabolicRate', label: 'TMB' },
];

function fmt(n: number | null): string {
  return n == null ? '—' : n.toLocaleString('pt-BR');
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}
function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function BioimpedanceSection({
  patientId,
  canEdit = true,
}: {
  patientId: string;
  canEdit?: boolean;
}) {
  const query = useAssessments(patientId);
  const [metric, setMetric] = useState<MetricKey>('weight');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BodyAssessment | null>(null);

  const data = query.data ?? [];
  const latest = data[0];

  // Chart series: chronological (oldest→newest), only points where the metric exists.
  const series = useMemo(
    () =>
      [...data]
        .reverse()
        .filter((a) => a[metric] != null)
        .map((a) => ({ date: fmtShort(a.assessmentDate), value: a[metric] as number })),
    [data, metric],
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-bold">Bioimpedância</h2>
        {canEdit && (
          <Button size="sm" className="rounded-full" onClick={() => setCreating(true)}>
            Nova avaliação
          </Button>
        )}
      </div>

      {query.isLoading && (
        <div data-testid="bio-loading" className="space-y-2 rounded-xl border bg-card p-4">
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {query.isError && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar as avaliações.{' '}
          <button onClick={() => query.refetch()} className="font-semibold text-primary hover:underline">
            Tentar de novo
          </button>
        </div>
      )}

      {query.data && data.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="font-medium">Nenhuma avaliação ainda</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Registre a bioimpedância do paciente para acompanhar a evolução.
          </p>
          {canEdit && (
            <Button className="rounded-full" onClick={() => setCreating(true)}>
              Registrar avaliação
            </Button>
          )}
        </div>
      )}

      {latest && (
        <>
          {/* Summary cards (latest) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SUMMARY.map((m) => (
              <div key={m.key} className="rounded-xl border bg-card p-3 text-center">
                <p className="text-lg font-bold">{fmt(latest[m.key])}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Trend chart */}
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMetric(m.key)}
                  aria-pressed={metric === m.key}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs',
                    metric === m.key
                      ? 'border-primary bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {series.length >= 2 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" fontSize={11} stroke="var(--muted-foreground)" />
                  <YAxis fontSize={11} stroke="var(--muted-foreground)" width={40} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#14BFA6" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Registre ao menos duas avaliações com esta métrica para ver a evolução.
              </p>
            )}
          </div>

          {/* History table */}
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Peso</th>
                  <th className="px-4 py-3 font-semibold">% Gord.</th>
                  <th className="px-4 py-3 font-semibold">Músculo</th>
                  <th className="px-4 py-3 font-semibold">Magra</th>
                  <th className="px-4 py-3 font-semibold">Cintura</th>
                  {canEdit && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {data.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{fmtDate(a.assessmentDate)}</td>
                    <td className="px-4 py-3">{fmt(a.weight)}</td>
                    <td className="px-4 py-3">{fmt(a.bodyFatPercentage)}</td>
                    <td className="px-4 py-3">{fmt(a.muscleMass)}</td>
                    <td className="px-4 py-3">{fmt(a.leanMass)}</td>
                    <td className="px-4 py-3">{fmt(a.waistCircumference)}</td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setEditing(a)}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AssessmentDialog
        open={creating}
        onOpenChange={(o) => !o && setCreating(false)}
        patientId={patientId}
      />
      {editing && (
        <AssessmentDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          patientId={patientId}
          assessment={editing}
        />
      )}
    </section>
  );
}
```

(Edit/delete both happen through `AssessmentDialog`: the table's "Editar" opens it in edit mode, where "Excluir" lives behind the inline confirm.)

- [ ] **Step 5: Wire the section in `PatientDetail`**

In `apps/web/src/components/patients/patient-detail.tsx`, change the placeholder render (currently `<BioimpedanceSection />`) to pass the patient id and the edit permission:

```tsx
      <BioimpedanceSection patientId={patient.id} canEdit={canEdit} />
```

(`PatientDetail` already accepts `canEdit` and forwards it to `EditPatientForm`; this reuses it.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @nutri-plus/web test -- bioimpedance-section`
Expected: PASS — loading/empty/summary+table/metric-switch/canEdit-gating all green.

- [ ] **Step 7: Typecheck + build**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

Run: `pnpm --filter @nutri-plus/web build`
Expected: succeeds (Recharts bundles into the patient detail route).

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/components/patients/bioimpedance-section.tsx apps/web/src/components/patients/bioimpedance-section.test.tsx apps/web/src/components/patients/patient-detail.tsx
git commit -m "feat(web): bioimpedance section with trend chart and history

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Full API suite: `pnpm --filter @nutri-plus/api test` — all green.
- [ ] Full web suite: `pnpm --filter @nutri-plus/web test` — all green.
- [ ] Typecheck + build: `pnpm --filter @nutri-plus/web exec tsc --noEmit` and `pnpm build` — clean.
- [ ] Manual smoke (dev): on a patient, as **nutritionist** — "Nova avaliação" records one; after two assessments the chart draws and the metric chips switch the series; "Editar" updates; "Excluir" (inline confirm) removes; the summary cards reflect the latest. As an **employee** — the summary/chart/table show but there is no "Nova avaliação"/"Editar".
