# Meal plans (Plano alimentar) + AI — UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the web UI for a patient's meal plans over the existing backend — list, create manually, generate with AI, view/edit the meals→items tree with macro targets/totals, and delete — with employees read-only.

**Architecture:** A `MealPlansSection` on the patient detail page lists plans and offers "Novo plano" + "✨ Gerar com IA"; a dedicated `MealPlanEditor` route (`/patients/[id]/planos/[planId]` and `/planos/novo`) edits the full tree with react-hook-form field arrays, a sticky targets×totals bar, and a wholesale PATCH save. No backend changes — only shared-types, the web data layer, and components. Writes are gated by the `canEdit` prop already on `PatientDetail`.

**Tech Stack:** Next.js 16 App Router + React 19 + React Query + react-hook-form (`useFieldArray`) + zod (apps/web, Vitest + RTL); `@nutri-plus/shared-types`.

## Global Constraints

- **Branch:** `feat/meal-plans-ui` (spec committed there), off `main`. Do all work on this branch.
- **No backend changes.** The endpoints below already exist and are tested. Do not touch `apps/api`.
- **API contract (exact):** `POST /v1/meal-plans` (create, NUTRITIONIST), `GET /v1/meal-plans?patientId=<uuid>` (list summaries, NUTRITIONIST+EMPLOYEE), `GET /v1/meal-plans/:id` (full tree, NUTRITIONIST+EMPLOYEE), `PATCH /v1/meal-plans/:id` (NUTRITIONIST; sending `meals` replaces the whole tree), `DELETE /v1/meal-plans/:id` (NUTRITIONIST), `POST /v1/ai/generate-meal-plan` body `{ patientId }` (NUTRITIONIST; returns the full plan; **422** with message `Cannot generate a plan: missing <tokens>` where tokens are among `weight (latest assessment), height, birthDate, gender, objective, activityLevel`).
- **AI fills structure, not item macros:** a generated plan has the meals/items + plan-level `target*`, but every item's `calories/protein/carbs/fats` is `null`. The UI renders null macros as "—" and the summed totals reflect only filled values.
- **Quotes:** SINGLE quotes for NEW files; match existing style when editing. `patient-detail.tsx` is single-quoted.
- **pt-BR** for all user-facing copy and validation messages.
- **Permissions:** `canEdit` (= `canManagePatients(role)`, already on `PatientDetail`) gates every write affordance; employees see everything read-only via the `<fieldset disabled>` pattern.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: shared-types — meal-plan types

**Files:**
- Create: `packages/shared-types/src/v1/meal-plan.ts`
- Modify: `packages/shared-types/src/v1/index.ts`

**Interfaces:**
- Produces: `MealItem`, `Meal`, `MealPlan`, `MealPlanSummary`, `MealItemInput`, `MealInput`, `CreateMealPlanRequest`, `UpdateMealPlanRequest`, `GenerateMealPlanRequest` (consumed by Tasks 2–6).

**Note:** types-only package, no runtime tests — gate is the build + emitted declarations.

- [ ] **Step 1: Create the types**

Create `packages/shared-types/src/v1/meal-plan.ts`:

```ts
// Dates are ISO strings over the wire; metric/target fields are nullable in storage.
export interface MealItem {
  id: string;
  mealId: string;
  foodName: string | null;
  quantity: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  order: number;
}

export interface Meal {
  id: string;
  mealPlanId: string;
  name: string | null;
  timeLabel: string | null;
  instructions: string | null;
  order: number;
  items: MealItem[];
}

export interface MealPlan {
  id: string;
  patientId: string;
  title: string | null;
  objective: string | null;
  aiGenerated: boolean;
  targetCalories: number | null;
  targetProtein: number | null;
  targetCarbs: number | null;
  targetFats: number | null;
  createdAt: string;
  updatedAt: string;
  meals: Meal[];
}

export type MealPlanSummary = Omit<MealPlan, 'meals'>;

export interface MealItemInput {
  foodName?: string;
  quantity?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
}

export interface MealInput {
  name?: string;
  timeLabel?: string;
  instructions?: string;
  items?: MealItemInput[];
}

export interface CreateMealPlanRequest {
  patientId: string;
  title?: string;
  objective?: string;
  targetCalories?: number;
  targetProtein?: number;
  targetCarbs?: number;
  targetFats?: number;
  meals?: MealInput[];
}

export type UpdateMealPlanRequest = Omit<CreateMealPlanRequest, 'patientId'>;

export interface GenerateMealPlanRequest {
  patientId: string;
}
```

- [ ] **Step 2: Export from the barrel**

In `packages/shared-types/src/v1/index.ts`, add at the end:

```ts
export * from './meal-plan';
```

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: exits 0.

Run: `grep -E 'interface MealPlan|MealPlanSummary|CreateMealPlanRequest|GenerateMealPlanRequest' packages/shared-types/dist/index.d.ts`
Expected: all present.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/v1/meal-plan.ts packages/shared-types/src/v1/index.ts packages/shared-types/dist
git commit -m "feat(shared-types): add meal plan types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Web — meal-plans API funcs + React Query hooks

**Files:**
- Create: `apps/web/src/lib/api/meal-plans.ts`
- Create: `apps/web/src/lib/api/meal-plans.test.ts`
- Create: `apps/web/src/lib/queries/meal-plans.ts`

**Interfaces:**
- Consumes: `browserApiFetch`; the Task 1 types.
- Produces:
  - `listMealPlans(patientId): Promise<MealPlanSummary[]>`, `getMealPlan(id): Promise<MealPlan>`, `createMealPlan(body: CreateMealPlanRequest): Promise<MealPlan>`, `updateMealPlan(id, body: UpdateMealPlanRequest): Promise<MealPlan>`, `deleteMealPlan(id): Promise<void>`, `generateMealPlan(patientId): Promise<MealPlan>`.
  - Hooks: `useMealPlans(patientId)` (key `['meal-plans', patientId]`), `useMealPlan(id)` (key `['meal-plan', id]`, enabled on truthy id), `useCreateMealPlan(patientId)` (mutationFn `CreateMealPlanRequest`), `useUpdateMealPlan(patientId)` (mutationFn `{ id, body }`), `useDeleteMealPlan(patientId)` (mutationFn `id`), `useGenerateMealPlan(patientId)` (mutationFn `patientId: string`). Mutations invalidate `['meal-plans', patientId]`; update also invalidates `['meal-plan', id]`.

- [ ] **Step 1: Write the failing API-function tests**

Create `apps/web/src/lib/api/meal-plans.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiFetch: (...args: unknown[]) => browserApiFetch(...args),
}));

import {
  listMealPlans,
  getMealPlan,
  createMealPlan,
  updateMealPlan,
  deleteMealPlan,
  generateMealPlan,
} from './meal-plans';

beforeEach(() => browserApiFetch.mockReset().mockResolvedValue(undefined));

describe('meal-plans API', () => {
  it('lists with the patientId query', async () => {
    await listMealPlans('p1');
    expect(browserApiFetch).toHaveBeenCalledWith('/meal-plans?patientId=p1');
  });
  it('gets one by id', async () => {
    await getMealPlan('m1');
    expect(browserApiFetch).toHaveBeenCalledWith('/meal-plans/m1');
  });
  it('creates with POST and body', async () => {
    await createMealPlan({ patientId: 'p1', title: 'Plano' });
    expect(browserApiFetch).toHaveBeenCalledWith('/meal-plans', {
      method: 'POST',
      body: { patientId: 'p1', title: 'Plano' },
    });
  });
  it('updates with PATCH and body', async () => {
    await updateMealPlan('m1', { title: 'Novo' });
    expect(browserApiFetch).toHaveBeenCalledWith('/meal-plans/m1', {
      method: 'PATCH',
      body: { title: 'Novo' },
    });
  });
  it('deletes with DELETE', async () => {
    await deleteMealPlan('m1');
    expect(browserApiFetch).toHaveBeenCalledWith('/meal-plans/m1', { method: 'DELETE' });
  });
  it('generates via the ai endpoint', async () => {
    await generateMealPlan('p1');
    expect(browserApiFetch).toHaveBeenCalledWith('/ai/generate-meal-plan', {
      method: 'POST',
      body: { patientId: 'p1' },
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- meal-plans.test`
Expected: FAIL — cannot resolve `./meal-plans`.

- [ ] **Step 3: Create the API functions**

Create `apps/web/src/lib/api/meal-plans.ts`:

```ts
import type {
  CreateMealPlanRequest,
  MealPlan,
  MealPlanSummary,
  UpdateMealPlanRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listMealPlans(patientId: string): Promise<MealPlanSummary[]> {
  return browserApiFetch<MealPlanSummary[]>(`/meal-plans?patientId=${patientId}`);
}

export function getMealPlan(id: string): Promise<MealPlan> {
  return browserApiFetch<MealPlan>(`/meal-plans/${id}`);
}

export function createMealPlan(body: CreateMealPlanRequest): Promise<MealPlan> {
  return browserApiFetch<MealPlan>('/meal-plans', { method: 'POST', body });
}

export function updateMealPlan(id: string, body: UpdateMealPlanRequest): Promise<MealPlan> {
  return browserApiFetch<MealPlan>(`/meal-plans/${id}`, { method: 'PATCH', body });
}

export function deleteMealPlan(id: string): Promise<void> {
  return browserApiFetch<void>(`/meal-plans/${id}`, { method: 'DELETE' });
}

export function generateMealPlan(patientId: string): Promise<MealPlan> {
  return browserApiFetch<MealPlan>('/ai/generate-meal-plan', {
    method: 'POST',
    body: { patientId },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @nutri-plus/web test -- meal-plans.test`
Expected: PASS — all six green.

- [ ] **Step 5: Create the query hooks**

Create `apps/web/src/lib/queries/meal-plans.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateMealPlanRequest, UpdateMealPlanRequest } from '@nutri-plus/shared-types';
import {
  createMealPlan,
  deleteMealPlan,
  generateMealPlan,
  getMealPlan,
  listMealPlans,
  updateMealPlan,
} from '@/lib/api/meal-plans';

export function useMealPlans(patientId: string) {
  return useQuery({
    queryKey: ['meal-plans', patientId],
    queryFn: () => listMealPlans(patientId),
    enabled: Boolean(patientId),
  });
}

export function useMealPlan(id: string) {
  return useQuery({
    queryKey: ['meal-plan', id],
    queryFn: () => getMealPlan(id),
    enabled: Boolean(id),
  });
}

export function useCreateMealPlan(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMealPlanRequest) => createMealPlan(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal-plans', patientId] }),
  });
}

export function useUpdateMealPlan(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMealPlanRequest }) =>
      updateMealPlan(id, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['meal-plans', patientId] });
      qc.invalidateQueries({ queryKey: ['meal-plan', data.id] });
    },
  });
}

export function useDeleteMealPlan(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMealPlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal-plans', patientId] }),
  });
}

export function useGenerateMealPlan(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => generateMealPlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal-plans', patientId] }),
  });
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/api/meal-plans.ts apps/web/src/lib/api/meal-plans.test.ts apps/web/src/lib/queries/meal-plans.ts
git commit -m "feat(web): add meal-plans API client and React Query hooks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Web — meal-plan validation schema

**Files:**
- Create: `apps/web/src/lib/validation/meal-plan.ts`
- Test: `apps/web/src/lib/validation/meal-plan.test.ts`

**Interfaces:**
- Produces: `mealPlanSchema` and `MealPlanFormValues` (used by the editor in Task 5). All fields optional/draft-friendly; text max-lengths and macro `≥ 0` mirror the DTO.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/validation/meal-plan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mealPlanSchema } from './meal-plan';

const base = { title: '', objective: '', targetCalories: '', targetProtein: '', targetCarbs: '', targetFats: '', meals: [] };

describe('mealPlanSchema', () => {
  it('accepts an empty draft (all optional)', () => {
    expect(mealPlanSchema.safeParse(base).success).toBe(true);
  });
  it('coerces macro strings to numbers', () => {
    const r = mealPlanSchema.safeParse({
      ...base,
      meals: [{ name: 'Café', timeLabel: '08:00', instructions: '', items: [{ foodName: 'Ovos', quantity: '3', calories: '230', protein: '18', carbs: '2', fats: '16' }] }],
    });
    expect(r.success && r.data.meals[0].items[0].calories).toBe(230);
  });
  it('rejects a negative macro', () => {
    const r = mealPlanSchema.safeParse({
      ...base,
      meals: [{ name: 'X', items: [{ foodName: 'Y', calories: '-5' }] }],
    });
    expect(r.success).toBe(false);
  });
  it('rejects a title over 200 chars', () => {
    expect(mealPlanSchema.safeParse({ ...base, title: 'a'.repeat(201) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- "validation/meal-plan"`
Expected: FAIL — cannot resolve `./meal-plan`.

- [ ] **Step 3: Create the schema**

Create `apps/web/src/lib/validation/meal-plan.ts`:

```ts
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

const mealSchema = z.object({
  name: optText(200),
  timeLabel: optText(100),
  instructions: optText(2000),
  items: z.array(mealItemSchema),
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @nutri-plus/web test -- "validation/meal-plan"`
Expected: PASS — all four green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/validation/meal-plan.ts apps/web/src/lib/validation/meal-plan.test.ts
git commit -m "feat(web): add meal-plan validation schema

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Web — `MealPlansSection` (list + generate) + patient-detail wiring

**Files:**
- Create: `apps/web/src/components/patients/meal-plans-section.tsx`
- Create: `apps/web/src/lib/meal-plans/generate-error.ts`
- Test: `apps/web/src/components/patients/meal-plans-section.test.tsx`
- Modify: `apps/web/src/components/patients/patient-detail.tsx`

**Interfaces:**
- Consumes: `useMealPlans`, `useGenerateMealPlan` (Task 2); `ApiError`; `next/navigation` `useRouter`; `MealPlanSummary` (Task 1).
- Produces: `MealPlansSection({ patientId, canEdit })`; and `missingFieldsFromError(err): string[] | null` (a pure helper mapping a generate 422's message tokens to pt-BR labels).

- [ ] **Step 1: Write the failing helper + section tests**

Create `apps/web/src/components/patients/meal-plans-section.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';

const useMealPlans = vi.fn();
const generateMut = vi.fn();
const push = vi.fn();

vi.mock('@/lib/queries/meal-plans', () => ({
  useMealPlans: () => useMealPlans(),
  useGenerateMealPlan: () => ({ mutateAsync: generateMut, isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { MealPlansSection } from './meal-plans-section';
import { missingFieldsFromError } from '@/lib/meal-plans/generate-error';

function plan(over = {}) {
  return {
    id: 'm1', patientId: 'p1', title: 'Plano A', objective: 'Hipertrofia',
    aiGenerated: true, targetCalories: 1800, targetProtein: 135, targetCarbs: 180, targetFats: 60,
    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', ...over,
  };
}

beforeEach(() => {
  useMealPlans.mockReset();
  generateMut.mockReset().mockResolvedValue(plan());
  push.mockReset();
});

describe('missingFieldsFromError', () => {
  it('maps 422 tokens to pt-BR labels', () => {
    const err = new ApiError(422, { message: 'Cannot generate a plan: missing height, gender, objective' });
    expect(missingFieldsFromError(err)).toEqual(['altura', 'gênero', 'objetivo']);
  });
  it('returns null for non-422', () => {
    expect(missingFieldsFromError(new ApiError(500, {}))).toBeNull();
  });
});

describe('MealPlansSection', () => {
  it('shows the empty state with CTAs when canEdit', () => {
    useMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<MealPlansSection patientId="p1" canEdit />);
    expect(screen.getByText(/nenhum plano ainda/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gerar com ia/i })).toBeInTheDocument();
  });

  it('hides CTAs for employees', () => {
    useMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [plan()] });
    render(<MealPlansSection patientId="p1" canEdit={false} />);
    expect(screen.queryByRole('button', { name: /gerar com ia/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /novo plano/i })).not.toBeInTheDocument();
  });

  it('lists plans with the AI badge', () => {
    useMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [plan()] });
    render(<MealPlansSection patientId="p1" canEdit />);
    expect(screen.getByText('Plano A')).toBeInTheDocument();
    expect(screen.getByText(/IA/)).toBeInTheDocument();
  });

  it('generates and navigates to the new plan', async () => {
    useMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<MealPlansSection patientId="p1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /gerar com ia/i }));
    await waitFor(() => expect(generateMut).toHaveBeenCalledWith('p1'));
    expect(push).toHaveBeenCalledWith('/patients/p1/planos/m1');
  });

  it('shows the missing-fields message on a 422', async () => {
    useMealPlans.mockReturnValue({ isLoading: false, isError: false, data: [] });
    generateMut.mockRejectedValue(new ApiError(422, { message: 'Cannot generate a plan: missing height, objective' }));
    render(<MealPlansSection patientId="p1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /gerar com ia/i }));
    expect(await screen.findByText(/altura/i)).toBeInTheDocument();
    expect(screen.getByText(/objetivo/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- meal-plans-section`
Expected: FAIL — cannot resolve the modules.

- [ ] **Step 3: Create the 422 helper**

Create `apps/web/src/lib/meal-plans/generate-error.ts`:

```ts
import { ApiError } from '@/lib/api/client';

// The generate endpoint 422s with: "Cannot generate a plan: missing <tokens>".
// Map the known tokens to pt-BR labels; returns null when it isn't a 422.
const TOKEN_LABELS: { token: string; label: string }[] = [
  { token: 'weight', label: 'peso (na bioimpedância)' },
  { token: 'height', label: 'altura' },
  { token: 'birthDate', label: 'data de nascimento' },
  { token: 'gender', label: 'gênero' },
  { token: 'objective', label: 'objetivo' },
  { token: 'activityLevel', label: 'nível de atividade' },
];

export function missingFieldsFromError(err: unknown): string[] | null {
  if (!(err instanceof ApiError) || err.status !== 422) return null;
  const body = err.body as { message?: string } | null;
  const message = typeof body?.message === 'string' ? body.message : '';
  const found = TOKEN_LABELS.filter(({ token }) => message.includes(token)).map((t) => t.label);
  return found.length > 0 ? found : ['o cadastro do paciente'];
}
```

- [ ] **Step 4: Create the section**

Create `apps/web/src/components/patients/meal-plans-section.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { MealPlanSummary } from '@nutri-plus/shared-types';
import { useGenerateMealPlan, useMealPlans } from '@/lib/queries/meal-plans';
import { missingFieldsFromError } from '@/lib/meal-plans/generate-error';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function MealPlansSection({
  patientId,
  canEdit = true,
}: {
  patientId: string;
  canEdit?: boolean;
}) {
  const query = useMealPlans(patientId);
  const generate = useGenerateMealPlan(patientId);
  const router = useRouter();
  const [missing, setMissing] = useState<string[] | null>(null);

  const plans = query.data ?? [];

  async function onGenerate() {
    setMissing(null);
    try {
      const plan = await generate.mutateAsync(patientId);
      router.push(`/patients/${patientId}/planos/${plan.id}`);
    } catch (err) {
      const fields = missingFieldsFromError(err);
      if (fields) {
        setMissing(fields);
      } else {
        toast.error('Não foi possível gerar o plano. Tente novamente.');
      }
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-bold">Planos alimentares</h2>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-full" asChild>
              <Link href={`/patients/${patientId}/planos/novo`}>Novo plano</Link>
            </Button>
            <Button
              size="sm"
              className="rounded-full"
              onClick={onGenerate}
              disabled={generate.isPending}
            >
              {generate.isPending ? 'Gerando…' : '✨ Gerar com IA'}
            </Button>
          </div>
        )}
      </div>

      {missing && (
        <div className="rounded-xl border border-destructive/40 bg-card p-4 text-sm">
          <p className="font-medium text-destructive">Complete o cadastro do paciente para gerar com IA.</p>
          <p className="mt-1 text-muted-foreground">Faltando: {missing.join(', ')}.</p>
        </div>
      )}

      {query.isLoading && (
        <div data-testid="meal-plans-loading" className="rounded-xl border bg-card p-4">
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {query.isError && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar os planos.{' '}
          <button onClick={() => query.refetch()} className="font-semibold text-primary hover:underline">
            Tentar de novo
          </button>
        </div>
      )}

      {query.data && plans.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="font-medium">Nenhum plano ainda</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Crie um plano manualmente ou gere um com IA a partir dos dados do paciente.
          </p>
        </div>
      )}

      {plans.length > 0 && (
        <div className="space-y-2">
          {plans.map((p: MealPlanSummary) => (
            <Link
              key={p.id}
              href={`/patients/${patientId}/planos/${p.id}`}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:bg-muted/40"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.title ?? 'Sem título'}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {p.objective ?? '—'} · {formatDate(p.createdAt)}
                  {p.targetCalories != null && ` · ${p.targetCalories} kcal`}
                </span>
              </span>
              {p.aiGenerated && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-secondary-foreground">
                  IA
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @nutri-plus/web test -- meal-plans-section`
Expected: PASS — helper + section cases green.

- [ ] **Step 6: Wire the section into the patient detail page**

In `apps/web/src/components/patients/patient-detail.tsx`, add the import near the other patient component imports:

```tsx
import { MealPlansSection } from '@/components/patients/meal-plans-section';
```

Then render it right after `<BioimpedanceSection … />` (which is the last section before the closing wrapper):

```tsx
      <BioimpedanceSection patientId={patient.id} canEdit={canEdit} />

      <MealPlansSection patientId={patient.id} canEdit={canEdit} />
```

- [ ] **Step 7: Update the patient-detail test mock + typecheck**

`apps/web/src/components/patients/patient-detail.test.tsx` renders `PatientDetail`, which now also renders `MealPlansSection` (real `useMealPlans`/`useGenerateMealPlan`). Add a mock alongside the existing query mocks so it doesn't hit React Query without a provider:

```tsx
vi.mock('@/lib/queries/meal-plans', () => ({
  useMealPlans: () => ({ data: [], isLoading: false, isError: false }),
  useGenerateMealPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
```

Run: `pnpm --filter @nutri-plus/web test -- patient-detail` (must stay green) and `pnpm --filter @nutri-plus/web exec tsc --noEmit` (exit 0).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/patients/meal-plans-section.tsx apps/web/src/components/patients/meal-plans-section.test.tsx apps/web/src/lib/meal-plans/generate-error.ts apps/web/src/components/patients/patient-detail.tsx apps/web/src/components/patients/patient-detail.test.tsx
git commit -m "feat(web): meal plans section with AI generate on patient detail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Web — `MealPlanEditor` (create / edit / delete, tree + totals)

**Files:**
- Create: `apps/web/src/components/patients/meal-plan-editor.tsx`
- Test: `apps/web/src/components/patients/meal-plan-editor.test.tsx`

**Interfaces:**
- Consumes: `useMealPlan`, `useCreateMealPlan`, `useUpdateMealPlan`, `useDeleteMealPlan` (Task 2); `mealPlanSchema`/`MealPlanFormValues` (Task 3); `MealPlan` (Task 1); `ApiError`; `next/navigation` `useRouter`; shadcn `Input`, `Textarea`, `Button`, `Skeleton`.
- Produces: `MealPlanEditor({ patientId, canEdit, planId? })` — create mode when `planId` absent, edit mode (loads via `useMealPlan`) when present. Used by the Task 6 routes.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/patients/meal-plan-editor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useMealPlan = vi.fn();
const createMut = vi.fn();
const updateMut = vi.fn();
const deleteMut = vi.fn();
const push = vi.fn();
const replace = vi.fn();

vi.mock('@/lib/queries/meal-plans', () => ({
  useMealPlan: () => useMealPlan(),
  useCreateMealPlan: () => ({ mutateAsync: createMut, isPending: false }),
  useUpdateMealPlan: () => ({ mutateAsync: updateMut, isPending: false }),
  useDeleteMealPlan: () => ({ mutateAsync: deleteMut, isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MealPlanEditor } from './meal-plan-editor';

const plan = {
  id: 'm1', patientId: 'p1', title: 'Plano A', objective: 'Hipertrofia', aiGenerated: false,
  targetCalories: 1800, targetProtein: 135, targetCarbs: 180, targetFats: 60,
  createdAt: '', updatedAt: '',
  meals: [
    { id: 'me1', mealPlanId: 'm1', name: 'Café', timeLabel: '08:00', instructions: '', order: 0,
      items: [{ id: 'it1', mealId: 'me1', foodName: 'Ovos', quantity: '3 unid', calories: 230, protein: 18, carbs: 2, fats: 16, order: 0 }] },
    { id: 'me2', mealPlanId: 'm1', name: 'Almoço', timeLabel: '12:30', instructions: '', order: 1, items: [] },
  ],
};

beforeEach(() => {
  useMealPlan.mockReset().mockReturnValue({ data: plan, isLoading: false, isError: false });
  createMut.mockReset().mockResolvedValue({ id: 'new1' });
  updateMut.mockReset().mockResolvedValue(plan);
  deleteMut.mockReset().mockResolvedValue(undefined);
  push.mockReset();
  replace.mockReset();
});

describe('MealPlanEditor (edit mode)', () => {
  it('renders the loaded tree and the summed totals', () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    expect(screen.getByDisplayValue('Plano A')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Café')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ovos')).toBeInTheDocument();
    // Totals bar shows the single item's calories total (230) vs target (1800).
    expect(screen.getByTestId('total-calories')).toHaveTextContent('230');
  });

  it('recomputes totals when an item macro changes', async () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    const cal = screen.getByDisplayValue('230');
    await userEvent.clear(cal);
    await userEvent.type(cal, '300');
    expect(screen.getByTestId('total-calories')).toHaveTextContent('300');
  });

  it('saves the whole tree via updateMealPlan', async () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1));
    const arg = updateMut.mock.calls[0][0];
    expect(arg.id).toBe('m1');
    expect(arg.body.meals).toHaveLength(2);
    expect(arg.body.meals[0].items[0].foodName).toBe('Ovos');
  });

  it('adds and removes a meal', async () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    expect(screen.getAllByTestId('meal-card')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: /adicionar refeição/i }));
    expect(screen.getAllByTestId('meal-card')).toHaveLength(3);
    const first = screen.getAllByTestId('meal-card')[0];
    await userEvent.click(within(first).getByRole('button', { name: /remover refeição/i }));
    expect(screen.getAllByTestId('meal-card')).toHaveLength(2);
  });

  it('deletes with an inline confirm', async () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
    await userEvent.click(screen.getByRole('button', { name: /excluir/i }));
    expect(screen.getByText(/não pode ser desfeita/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^excluir$/i }));
    await waitFor(() => expect(deleteMut).toHaveBeenCalledWith('m1'));
  });

  it('is read-only for employees: no Salvar, fields disabled', () => {
    render(<MealPlanEditor patientId="p1" planId="m1" canEdit={false} />);
    expect(screen.queryByRole('button', { name: /^salvar$/i })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Plano A')).toBeDisabled();
  });
});

describe('MealPlanEditor (create mode)', () => {
  it('starts blank and creates via createMealPlan, then navigates', async () => {
    render(<MealPlanEditor patientId="p1" canEdit />);
    await userEvent.type(screen.getByLabelText(/título/i), 'Novo plano');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(createMut).toHaveBeenCalledTimes(1));
    expect(createMut.mock.calls[0][0].patientId).toBe('p1');
    expect(createMut.mock.calls[0][0].title).toBe('Novo plano');
    expect(replace).toHaveBeenCalledWith('/patients/p1/planos/new1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- meal-plan-editor`
Expected: FAIL — cannot resolve `./meal-plan-editor`.

- [ ] **Step 3: Create the editor**

Create `apps/web/src/components/patients/meal-plan-editor.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useFieldArray,
  useForm,
  type Control,
  type Resolver,
  type UseFormRegister,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { MealPlan } from '@nutri-plus/shared-types';
import { mealPlanSchema, type MealPlanFormValues } from '@/lib/validation/meal-plan';
import {
  useCreateMealPlan,
  useDeleteMealPlan,
  useMealPlan,
  useUpdateMealPlan,
} from '@/lib/queries/meal-plans';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

type FormValues = {
  title: string;
  objective: string;
  targetCalories: string;
  targetProtein: string;
  targetCarbs: string;
  targetFats: string;
  meals: {
    name: string;
    timeLabel: string;
    instructions: string;
    items: { foodName: string; quantity: string; calories: string; protein: string; carbs: string; fats: string }[];
  }[];
};

const blankItem = () => ({ foodName: '', quantity: '', calories: '', protein: '', carbs: '', fats: '' });
const blankMeal = () => ({ name: '', timeLabel: '', instructions: '', items: [blankItem()] });

function blankDefaults(): FormValues {
  return {
    title: '', objective: '', targetCalories: '', targetProtein: '', targetCarbs: '', targetFats: '',
    meals: [blankMeal()],
  };
}

const numToStr = (n: number | null) => (n == null ? '' : String(n));

function toDefaults(plan: MealPlan): FormValues {
  return {
    title: plan.title ?? '',
    objective: plan.objective ?? '',
    targetCalories: numToStr(plan.targetCalories),
    targetProtein: numToStr(plan.targetProtein),
    targetCarbs: numToStr(plan.targetCarbs),
    targetFats: numToStr(plan.targetFats),
    meals: plan.meals.map((m) => ({
      name: m.name ?? '',
      timeLabel: m.timeLabel ?? '',
      instructions: m.instructions ?? '',
      items: m.items.map((it) => ({
        foodName: it.foodName ?? '',
        quantity: it.quantity ?? '',
        calories: numToStr(it.calories),
        protein: numToStr(it.protein),
        carbs: numToStr(it.carbs),
        fats: numToStr(it.fats),
      })),
    })),
  };
}

const TARGETS = [
  { key: 'targetCalories', total: 'calories', label: 'Kcal' },
  { key: 'targetProtein', total: 'protein', label: 'Proteína' },
  { key: 'targetCarbs', total: 'carbs', label: 'Carbo' },
  { key: 'targetFats', total: 'fats', label: 'Gordura' },
] as const;

const ITEM_MACROS = [
  { key: 'calories', label: 'Kcal' },
  { key: 'protein', label: 'P' },
  { key: 'carbs', label: 'C' },
  { key: 'fats', label: 'G' },
] as const;

function sum(values: string[]): number {
  return values.reduce((acc, v) => acc + (Number(v) || 0), 0);
}

export function MealPlanEditor({
  patientId,
  canEdit = true,
  planId,
}: {
  patientId: string;
  canEdit?: boolean;
  planId?: string;
}) {
  const isCreate = !planId;
  const query = useMealPlan(planId ?? '');
  const create = useCreateMealPlan(patientId);
  const update = useUpdateMealPlan(patientId);
  const remove = useDeleteMealPlan(patientId);
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(mealPlanSchema) as unknown as Resolver<FormValues>,
    defaultValues: blankDefaults(),
  });
  const meals = useFieldArray({ control: form.control, name: 'meals' });

  useEffect(() => {
    if (query.data) form.reset(toDefaults(query.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const watched = form.watch('meals');
  function totalFor(macro: 'calories' | 'protein' | 'carbs' | 'fats'): number {
    return sum((watched ?? []).flatMap((m) => (m.items ?? []).map((it) => it[macro])));
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      if (isCreate) {
        const created = await create.mutateAsync({ patientId, ...(values as unknown as MealPlanFormValues) });
        toast.success('Plano criado.');
        router.replace(`/patients/${patientId}/planos/${created.id}`);
      } else {
        await update.mutateAsync({ id: planId!, body: values as unknown as MealPlanFormValues });
        toast.success('Plano salvo.');
      }
    } catch (err) {
      setFormError(
        err instanceof ApiError ? 'Não foi possível salvar o plano.' : 'Erro inesperado ao salvar.',
      );
    }
  }

  async function onDelete() {
    if (isCreate) return;
    try {
      await remove.mutateAsync(planId!);
      toast.success('Plano excluído.');
      router.push(`/patients/${patientId}`);
    } catch {
      toast.error('Não foi possível excluir o plano.');
    }
  }

  if (!isCreate && query.isLoading) {
    return <Skeleton className="h-64 w-full max-w-3xl" />;
  }
  if (!isCreate && (query.isError || !query.data)) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Plano não encontrado.
      </div>
    );
  }

  const pending = form.formState.isSubmitting || create.isPending || update.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0">
          {/* Header */}
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="mp-title">Título</label>
            <Input id="mp-title" placeholder="Título do plano" {...form.register('title')} />
            <Input placeholder="Objetivo" aria-label="Objetivo" {...form.register('objective')} />
          </div>

          {/* Metas (por dia) */}
          <div className="rounded-xl border bg-card p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metas (por dia)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TARGETS.map((t) => (
                <label key={t.key} className="text-xs">
                  <span className="mb-1 block text-muted-foreground">{t.label}</span>
                  <Input type="number" inputMode="decimal" step="any" {...form.register(t.key)} />
                </label>
              ))}
            </div>
          </div>

          {/* Totals bar */}
          <div className="sticky top-0 z-10 flex flex-wrap gap-4 rounded-xl border bg-card p-3">
            {TARGETS.map((t) => {
              const total = totalFor(t.total);
              const target = Number(form.watch(t.key)) || 0;
              return (
                <div key={t.total} className="text-center">
                  <b data-testid={`total-${t.total}`} className="block text-sm">
                    {total}
                    {target > 0 && <span className="text-muted-foreground">/{target}</span>}
                  </b>
                  <span className="text-[10px] text-muted-foreground">{t.label}</span>
                </div>
              );
            })}
          </div>

          {/* Meal cards */}
          {meals.fields.map((mealField, mealIndex) => (
            <MealCard
              key={mealField.id}
              control={form.control}
              register={form.register}
              mealIndex={mealIndex}
              canEdit={canEdit}
              isFirst={mealIndex === 0}
              isLast={mealIndex === meals.fields.length - 1}
              onRemove={() => meals.remove(mealIndex)}
              onMoveUp={() => meals.swap(mealIndex, mealIndex - 1)}
              onMoveDown={() => meals.swap(mealIndex, mealIndex + 1)}
            />
          ))}

          {canEdit && (
            <Button type="button" variant="outline" className="rounded-full" onClick={() => meals.append(blankMeal())}>
              + Adicionar refeição
            </Button>
          )}
        </fieldset>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        {canEdit && (
          <div className="flex items-center gap-2">
            {!isCreate &&
              (confirmingDelete ? (
                <span className="mr-auto flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Excluir? Esta ação não pode ser desfeita.</span>
                  <Button type="button" variant="outline" className="rounded-full" onClick={() => setConfirmingDelete(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={onDelete}
                    disabled={remove.isPending}
                  >
                    Excluir
                  </Button>
                </span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto rounded-full text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Excluir
                </Button>
              ))}
            <Button type="submit" className="rounded-full" disabled={pending}>
              {pending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}

function MealCard({
  control,
  register,
  mealIndex,
  canEdit,
  isFirst,
  isLast,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  mealIndex: number;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const items = useFieldArray({ control, name: `meals.${mealIndex}.items` as const });

  return (
    <div data-testid="meal-card" className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input className="max-w-48" placeholder="Refeição" aria-label="Nome da refeição" {...register(`meals.${mealIndex}.name`)} />
        <Input className="max-w-28" placeholder="08:00" aria-label="Horário" {...register(`meals.${mealIndex}.timeLabel`)} />
        {canEdit && (
          <span className="ml-auto flex gap-1">
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onMoveUp} disabled={isFirst} aria-label="Mover refeição para cima">↑</Button>
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onMoveDown} disabled={isLast} aria-label="Mover refeição para baixo">↓</Button>
            <Button type="button" variant="outline" size="sm" className="rounded-full text-destructive" onClick={onRemove} aria-label="Remover refeição">✕</Button>
          </span>
        )}
      </div>

      <Textarea rows={1} placeholder="Instruções (opcional)" aria-label="Instruções" {...register(`meals.${mealIndex}.instructions`)} />

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase text-muted-foreground">
              <th className="py-1">Alimento</th><th className="py-1">Qtd</th>
              <th className="py-1">Kcal</th><th className="py-1">P</th><th className="py-1">C</th><th className="py-1">G</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {items.fields.map((itemField, itemIndex) => (
              <tr key={itemField.id}>
                <td className="py-1 pr-1"><Input className="h-7" aria-label="Alimento" {...register(`meals.${mealIndex}.items.${itemIndex}.foodName`)} /></td>
                <td className="py-1 pr-1"><Input className="h-7 w-20" aria-label="Quantidade" {...register(`meals.${mealIndex}.items.${itemIndex}.quantity`)} /></td>
                {ITEM_MACROS.map((m) => (
                  <td key={m.key} className="py-1 pr-1">
                    <Input className="h-7 w-16" type="number" inputMode="decimal" step="any" aria-label={m.label}
                      {...register(`meals.${mealIndex}.items.${itemIndex}.${m.key}` as const)} />
                  </td>
                ))}
                {canEdit && (
                  <td className="py-1">
                    <Button type="button" variant="outline" size="sm" className="rounded-full text-destructive" onClick={() => items.remove(itemIndex)} aria-label="Remover item">✕</Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={() => items.append(blankItem())}>
          + Adicionar item
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @nutri-plus/web test -- meal-plan-editor`
Expected: PASS — all edit + create cases green. (Totals read from `form.watch('meals')`; the macro `Input`s are uncontrolled text bound by `register`, so typing updates the watched values and the `total-*` testids.)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/patients/meal-plan-editor.tsx apps/web/src/components/patients/meal-plan-editor.test.tsx
git commit -m "feat(web): meal plan editor (tree, targets/totals, create/edit/delete)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Web — editor routes + role guards

**Files:**
- Create: `apps/web/src/app/(app)/patients/[id]/planos/[planId]/page.tsx`
- Create: `apps/web/src/app/(app)/patients/[id]/planos/novo/page.tsx`
- Test: `apps/web/src/app/(app)/patients/[id]/planos/novo/page.test.tsx`

**Interfaces:**
- Consumes: `getCurrentUser` + `canManagePatients` (existing); `Unauthorized` (existing); `MealPlanEditor` (Task 5).
- Produces: the two routes. `[planId]` renders the editor in edit mode (read-only for employees via `canEdit`). `novo` renders the editor in create mode, but `Unauthorized` for a non-editor (creating requires nutritionist).

- [ ] **Step 1: Write the failing test for the `novo` guard**

Create `apps/web/src/app/(app)/patients/[id]/planos/novo/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole } from '@nutri-plus/shared-types';

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/components/patients/meal-plan-editor', () => ({
  MealPlanEditor: () => <div>meal-plan-editor</div>,
}));

import NewMealPlanPage from './page';

function me(role: UserRole) {
  return { id: 'u1', email: 'x@y.com', name: 'X', role };
}

beforeEach(() => getCurrentUser.mockReset());

describe('NewMealPlanPage guard', () => {
  it('shows the editor for a nutritionist', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.NUTRITIONIST));
    render(await NewMealPlanPage({ params: Promise.resolve({ id: 'p1' }) }));
    expect(screen.getByText('meal-plan-editor')).toBeInTheDocument();
  });

  it('shows Não autorizado for an employee', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.EMPLOYEE));
    render(await NewMealPlanPage({ params: Promise.resolve({ id: 'p1' }) }));
    expect(screen.getByText(/não autorizado/i)).toBeInTheDocument();
    expect(screen.queryByText('meal-plan-editor')).not.toBeInTheDocument();
  });
}); 
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- "planos/novo/page"`
Expected: FAIL — cannot resolve `./page`.

- [ ] **Step 3: Create the `novo` route**

Create `apps/web/src/app/(app)/patients/[id]/planos/novo/page.tsx`:

```tsx
import { MealPlanEditor } from '@/components/patients/meal-plan-editor';
import { Unauthorized } from '@/components/auth/unauthorized';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManagePatients } from '@/lib/auth/access';

export default async function NewMealPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me || !canManagePatients(me.role)) {
    return <Unauthorized />;
  }
  return <MealPlanEditor patientId={id} canEdit />;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @nutri-plus/web test -- "planos/novo/page"`
Expected: PASS — both cases green.

- [ ] **Step 5: Create the `[planId]` route**

Create `apps/web/src/app/(app)/patients/[id]/planos/[planId]/page.tsx`:

```tsx
import { MealPlanEditor } from '@/components/patients/meal-plan-editor';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManagePatients } from '@/lib/auth/access';

export default async function MealPlanPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id, planId } = await params;
  const me = await getCurrentUser();
  const canEdit = !!me && canManagePatients(me.role);
  return <MealPlanEditor patientId={id} planId={planId} canEdit={canEdit} />;
}
```

(Employees reach this route read-only — viewing is allowed by the API — so it does not render `Unauthorized`; only the editor's write affordances are gated by `canEdit`.)

- [ ] **Step 6: Typecheck + build**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

Run: `pnpm --filter @nutri-plus/web build`
Expected: succeeds; the new `/patients/[id]/planos/[planId]` and `/patients/[id]/planos/novo` routes appear.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(app)/patients/[id]/planos"
git commit -m "feat(web): meal plan editor routes with role guards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Full web suite: `pnpm --filter @nutri-plus/web test` — all green (watch for the `patient-detail` sibling suite, updated in Task 4).
- [ ] Typecheck + build: `pnpm --filter @nutri-plus/web exec tsc --noEmit` and `pnpm build` — clean.
- [ ] Manual smoke (dev), as **nutritionist** on a patient: "Planos alimentares" lists plans; "✨ Gerar com IA" creates one and opens the editor (item macros empty, targets filled); on an incomplete patient it shows the missing fields; "Novo plano" opens a blank editor and Salvar creates + opens it; editing the tree (add/remove/reorder meals + items, edit macros) updates the totals and Salvar persists; Excluir (inline confirm) removes and returns to the patient. As an **employee**: the list shows with no "Novo plano"/"Gerar com IA"; opening a plan shows the editor read-only (no Salvar/Excluir, fields disabled); `/planos/novo` shows "Não autorizado".
