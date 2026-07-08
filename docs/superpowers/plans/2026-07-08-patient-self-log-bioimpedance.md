# Patient Self-Log Bioimpedance (nutritionist-gated) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a nutritionist decide per patient whether that patient can add their own bioimpedance entries in the mobile app; when enabled, show a form mirroring the web fields; when disabled, hide the feature entirely.

**Architecture:** A `canLogAssessments` boolean on `PatientProfile` (default false). The nutritionist sets it via the existing patient PATCH. The patient app reads the flag from `GET /me/assessments` (`MyEvolutionResponse.canLog`), shows/hides the "Registrar medição" affordance, and posts new entries to a gated `POST /me/assessments`. The API enforces the gate (403) independent of the hidden UI.

**Tech Stack:** NestJS + Prisma 7 (API), Next.js + react-hook-form + zod (web), Expo/React Native + expo-router + react-hook-form + zod (mobile), `@nutri-plus/shared-types` (workspace, tsc-built).

## Global Constraints

- SINGLE quotes in new files; pt-BR user-facing copy.
- The mobile form mirrors the web assessment fields + validation **exactly**. The verbatim duplication of the zod schema across web and mobile is **intentional and required by the spec** (web and mobile cannot share a runtime zod schema here) — not a defect to flag.
- Reuse existing mobile primitives (`Screen`/`TextField`/`Button`); no new UI primitives. Expo Go must keep working (no dev-build-only native modules).
- Additive migration on the shared dev DB (`prisma migrate dev`); never commit `.env` or `.expo/`.
- `canLogAssessments` defaults to `false` (feature hidden unless the nutritionist enables it).
- Defense-in-depth: `POST /me/assessments` returns 403 when the flag is off, independent of the hidden UI.
- typedRoutes is ON: regenerate router types (`pnpm --filter @nutri-plus/mobile exec npx expo customize tsconfig.json`) before mobile `tsc` on the task that adds a route. Never name a test file with a `_layout` prefix.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do not push/PR unless asked.
- Verify per layer: API `pnpm --filter @nutri-plus/api test`; shared-types `pnpm --filter @nutri-plus/shared-types build`; web `pnpm --filter @nutri-plus/web test`; mobile `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` AND `pnpm --filter @nutri-plus/mobile test`. Keep current suites green.

---

## Task 1: Data model + shared-types (Part A)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `PatientProfile`)
- Create (generated): a new migration under `apps/api/prisma/migrations/`
- Modify: `packages/shared-types/src/v1/assessment.ts`
- Modify: `packages/shared-types/src/v1/patient.ts`

**Interfaces:**
- Produces: `PatientProfile.canLogAssessments: boolean` (DB, default false); `MyEvolutionResponse.canLog: boolean`; `PatientSummary.canLogAssessments: boolean`; `UpdatePatientRequest` gains optional `canLogAssessments?: boolean`.

- [ ] **Step 1: Add the Prisma field**

In `apps/api/prisma/schema.prisma`, inside `model PatientProfile`, add the field after `notes String?` (before `createdAt`):

```prisma
  canLogAssessments Boolean @default(false)
```

- [ ] **Step 2: Create + apply the additive migration**

Run:
```bash
pnpm --filter @nutri-plus/api exec prisma migrate dev --name patient_can_log_assessments
```
Expected: a new migration folder is created and applied to the shared dev DB; the Prisma client regenerates (adds `canLogAssessments`). No data loss (additive, defaulted column).

- [ ] **Step 3: Extend `MyEvolutionResponse`**

In `packages/shared-types/src/v1/assessment.ts`, add `canLog` to the interface:

```ts
// Response of GET /v1/me/assessments — the caller's own evolution.
export interface MyEvolutionResponse {
  name: string;
  height: number | null;
  assessments: BodyAssessment[];
  canLog: boolean;
}
```

- [ ] **Step 4: Extend the patient types**

In `packages/shared-types/src/v1/patient.ts`:

Add `canLogAssessments` to `PatientSummary` (after `notes`):
```ts
  notes: string | null;
  canLogAssessments: boolean;
  createdAt: string;
  updatedAt: string;
```

Change `UpdatePatientRequest` to include the optional flag:
```ts
export type UpdatePatientRequest = Omit<CreatePatientRequest, 'name' | 'email'> & {
  canLogAssessments?: boolean;
};
```

(`PatientDetail extends PatientSummary`, so it inherits the field.)

- [ ] **Step 5: Build shared-types**

Run:
```bash
pnpm --filter @nutri-plus/shared-types build
```
Expected: `tsc` completes with no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/shared-types/src/v1/assessment.ts packages/shared-types/src/v1/patient.ts
git commit -m "feat(db,shared-types): patient canLogAssessments flag + canLog in evolution

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: API — gated patient POST + nutritionist flag (Part B)

**Files:**
- Modify: `apps/api/src/patients/dto/update-patient.dto.ts`
- Modify: `apps/api/src/patients/patient-assessments.controller.ts`
- Modify: `apps/api/src/patients/patients.service.ts`
- Test: `apps/api/src/patients/patients.service.spec.ts`

**Interfaces:**
- Consumes: `canLogAssessments` on `ctx.user.patientProfile` (loaded via `users.service.ts` `patientProfile: true`); `resolveScopePatientId(ctx)` from `../auth/auth-scope`; existing `CreateAssessmentDto`.
- Produces: `PatientsService.createMyAssessment(ctx, dto): Promise<BodyAssessment>`; `POST /v1/me/assessments`; `listMyAssessments` now returns `canLog`.

- [ ] **Step 1: Write the failing service tests**

In `apps/api/src/patients/patients.service.spec.ts`, add a ctx helper near the other `ctx*` helpers:

```ts
function ctxPatientCanLog(patientProfileId: string, canLogAssessments: boolean): AuthContext {
  return {
    authProviderId: 'sub-p',
    email: 'p@x.com',
    name: 'Ana',
    user: {
      id: 'user-p',
      role: 'PATIENT',
      nutritionistProfile: null,
      employeeProfile: null,
      patientProfile: { id: patientProfileId, height: null, canLogAssessments },
    } as any,
  };
}
```

Then add a `describe` block (inside the top-level `describe('PatientsService', ...)`):

```ts
describe('createMyAssessment', () => {
  it('creates when the patient may self-log', async () => {
    const ctx = ctxPatientCanLog('patient-1', true);
    prisma.bodyAssessment.create.mockResolvedValue({ id: 'a1' } as any);
    await service.createMyAssessment(ctx, { weight: 80 } as any);
    expect(prisma.bodyAssessment.create).toHaveBeenCalledWith({
      data: { weight: 80, patientId: 'patient-1' },
    });
  });

  it('rejects with 403 when the patient may not self-log', async () => {
    const ctx = ctxPatientCanLog('patient-1', false);
    await expect(service.createMyAssessment(ctx, { weight: 80 } as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.bodyAssessment.create).not.toHaveBeenCalled();
  });
});

describe('listMyAssessments canLog', () => {
  it('includes canLog from the patient profile', async () => {
    const ctx = ctxPatientCanLog('patient-1', true);
    prisma.bodyAssessment.findMany.mockResolvedValue([] as any);
    const res = await service.listMyAssessments(ctx);
    expect(res.canLog).toBe(true);
  });
});
```

(`ForbiddenException` is already imported at the top of this spec.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nutri-plus/api test -- patients.service`
Expected: FAIL — `createMyAssessment` is not a function / `canLog` is undefined.

- [ ] **Step 3: Implement the service methods**

In `apps/api/src/patients/patients.service.ts`:

Ensure `ForbiddenException` is imported from `@nestjs/common` (add it to the existing import if missing).

Add the method (place it next to `listMyAssessments`):

```ts
  // Patient-facing: the caller adds a NEW assessment for themselves. Gated by
  // the nutritionist-controlled flag — enforced here regardless of the app UI.
  async createMyAssessment(ctx: AuthContext, dto: CreateAssessmentDto) {
    const patientId = resolveScopePatientId(ctx);
    if (!ctx.user?.patientProfile?.canLogAssessments) {
      throw new ForbiddenException('Not allowed to log assessments');
    }
    return this.prisma.bodyAssessment.create({
      data: { ...dto, patientId },
    });
  }
```

Update `listMyAssessments` to return `canLog`:

```ts
    return {
      name: ctx.name,
      height: ctx.user?.patientProfile?.height ?? null,
      assessments,
      canLog: ctx.user?.patientProfile?.canLogAssessments ?? false,
    };
```

(`CreateAssessmentDto` and `resolveScopePatientId` are already imported in this file — verify; add the import if the linter flags it.)

- [ ] **Step 4: Add the POST route**

In `apps/api/src/patients/patient-assessments.controller.ts`, import `Body` and `Post` and `CreateAssessmentDto`, and add the handler:

```ts
import { Body, Controller, Get, Post } from '@nestjs/common';
// ...existing imports...
import { CreateAssessmentDto } from './dto/create-assessment.dto';

// inside the class, after list():
  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreateAssessmentDto) {
    return this.patients.createMyAssessment(ctx, dto);
  }
```

- [ ] **Step 5: Add the nutritionist flag to `UpdatePatientDto`**

In `apps/api/src/patients/dto/update-patient.dto.ts`, add `IsBoolean` to the `class-validator` import and add the field (after `notes`):

```ts
  @IsOptional()
  @IsBoolean()
  canLogAssessments?: boolean;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/api test`
Expected: PASS — full API suite green (previous count + 3 new tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/patients
git commit -m "feat(api): gated POST /me/assessments + canLog + patient flag DTO

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Web — nutritionist toggle in the edit form (Part C)

**Files:**
- Modify: `apps/web/src/lib/validation/patient.ts`
- Modify: `apps/web/src/components/patients/edit-patient-form.tsx`
- Test: `apps/web/src/components/patients/edit-patient-form.test.tsx`

**Interfaces:**
- Consumes: `PatientDetail.canLogAssessments` (Task 1); `useUpdatePatient(id).mutateAsync(values)` (existing).
- Produces: the edit form submits `canLogAssessments` in the PATCH payload.

- [ ] **Step 1: Add the field to the update schema**

In `apps/web/src/lib/validation/patient.ts`, change the `updatePatientSchema` (leave `createPatientSchema` untouched):

```ts
export const updatePatientSchema = z.object({
  ...clinicalShape,
  canLogAssessments: z.boolean().optional(),
});
```

- [ ] **Step 2: Write the failing test**

In `apps/web/src/components/patients/edit-patient-form.test.tsx`, add `canLogAssessments: false` to the `patient` fixture (after `notes: null`), then add:

```ts
import { fireEvent } from '@testing-library/react';

it('toggles self-log permission and submits it', async () => {
  mutateAsync.mockResolvedValue({});
  render(<EditPatientForm patient={patient} />);

  fireEvent.click(screen.getByRole('button', { name: /registrar bioimpedância/i }));
  fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));

  await vi.waitFor(() =>
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ canLogAssessments: true }),
    ),
  );
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- edit-patient-form`
Expected: FAIL — no button matching `/registrar bioimpedância/i`.

- [ ] **Step 4: Add the toggle + default**

In `apps/web/src/components/patients/edit-patient-form.tsx`:

Add `canLogAssessments` to `toDefaults`:
```ts
    notes: p.notes ?? "",
    canLogAssessments: p.canLogAssessments,
```

Render a labeled toggle (matching the meal-plan visibility Button pattern) inside the `<fieldset>`, after `<PatientClinicalFields ... />`:

```tsx
          <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Bioimpedância no app</p>
              <p className="text-xs text-muted-foreground">
                Permitir que o paciente registre bioimpedância no app.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={form.watch("canLogAssessments") ? "default" : "outline"}
              className="shrink-0 rounded-full"
              aria-pressed={Boolean(form.watch("canLogAssessments"))}
              onClick={() =>
                form.setValue("canLogAssessments", !form.watch("canLogAssessments"), {
                  shouldDirty: true,
                })
              }
            >
              {form.watch("canLogAssessments")
                ? "Permitido: registrar bioimpedância ✓"
                : "Permitir registrar bioimpedância"}
            </Button>
          </div>
```

(`Button` is already imported. `size` is supported by the shadcn Button.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @nutri-plus/web test -- edit-patient-form`
Expected: PASS. Then run `pnpm --filter @nutri-plus/web test` — full suite green.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/validation/patient.ts apps/web/src/components/patients/edit-patient-form.tsx apps/web/src/components/patients/edit-patient-form.test.tsx
git commit -m "feat(web): toggle patient self-log bioimpedance in the edit form

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Mobile — assessment schema + create mutation (Part D-1)

**Files:**
- Create: `apps/mobile/lib/validation/assessment.ts`
- Test: `apps/mobile/lib/validation/assessment.test.ts`
- Modify: `apps/mobile/lib/queries/assessments.ts`
- Test: `apps/mobile/lib/queries/assessments.test.tsx`

**Interfaces:**
- Consumes: `CreateAssessmentRequest`, `BodyAssessment` (`@nutri-plus/shared-types`); `apiFetch` (`../api`); query key `['me', 'assessments']`.
- Produces: `assessmentSchema` + `type AssessmentValues`; `useCreateMyAssessment()` mutation.

- [ ] **Step 1: Create the mobile schema (mirrors web exactly)**

Create `apps/mobile/lib/validation/assessment.ts` with **the exact same rules as `apps/web/src/lib/validation/assessment.ts`**:

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

- [ ] **Step 2: Write the failing schema test**

Create `apps/mobile/lib/validation/assessment.test.ts`:

```ts
import { assessmentSchema } from './assessment';

describe('assessmentSchema', () => {
  it('requires at least one metric', () => {
    const r = assessmentSchema.safeParse({ notes: 'oi' });
    expect(r.success).toBe(false);
  });

  it('coerces a single numeric metric string and passes', () => {
    const r = assessmentSchema.safeParse({ weight: '80.5' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.weight).toBe(80.5);
  });

  it('rejects a future assessmentDate', () => {
    const r = assessmentSchema.safeParse({ weight: '80', assessmentDate: '2999-01-01' });
    expect(r.success).toBe(false);
  });

  it('rejects a non-positive weight', () => {
    const r = assessmentSchema.safeParse({ weight: '0' });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the schema test (verify pass)**

Run: `pnpm --filter @nutri-plus/mobile test -- assessment`
Expected: PASS (schema created in Step 1).

- [ ] **Step 4: Write the failing mutation test**

Create `apps/mobile/lib/queries/assessments.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { apiFetch } from '../api';
import { useCreateMyAssessment } from './assessments';

jest.mock('../api', () => ({ apiFetch: jest.fn() }));

function Probe({ onReady }: { onReady: (m: ReturnType<typeof useCreateMyAssessment>) => void }) {
  const mutation = useCreateMyAssessment();
  onReady(mutation);
  return <Text>probe</Text>;
}

function renderProbe() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  let mutation!: ReturnType<typeof useCreateMyAssessment>;
  render(
    <QueryClientProvider client={client}>
      <Probe onReady={(m) => (mutation = m)} />
    </QueryClientProvider>,
  );
  return { mutation, invalidate };
}

describe('useCreateMyAssessment', () => {
  beforeEach(() => (apiFetch as jest.Mock).mockReset());

  it('POSTs to /me/assessments and invalidates the evolution query', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: 'a1' });
    const { mutation, invalidate } = renderProbe();

    await mutation.mutateAsync({ weight: 80 });

    expect(apiFetch).toHaveBeenCalledWith('/me/assessments', { method: 'POST', body: { weight: 80 } });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me', 'assessments'] }),
    );
  });
});
```

- [ ] **Step 5: Run the mutation test to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile test -- assessments`
Expected: FAIL — `useCreateMyAssessment` is not exported.

- [ ] **Step 6: Implement the mutation**

In `apps/mobile/lib/queries/assessments.ts`, add imports and the hook:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BodyAssessment, CreateAssessmentRequest, MyEvolutionResponse } from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

// ...existing getMyEvolution + useMyEvolution...

export function useCreateMyAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAssessmentRequest) =>
      apiFetch<BodyAssessment>('/me/assessments', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me', 'assessments'] });
    },
  });
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @nutri-plus/mobile test -- assessment`
Expected: PASS (schema + mutation tests).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/lib/validation/assessment.ts apps/mobile/lib/validation/assessment.test.ts apps/mobile/lib/queries/assessments.ts apps/mobile/lib/queries/assessments.test.tsx
git commit -m "feat(mobile): assessment zod schema (mirrors web) + create mutation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Mobile — form screen + Evolução gate (Part D-2)

**Files:**
- Create: `apps/mobile/app/(app)/nova-medicao.tsx`
- Test: `apps/mobile/app/(app)/nova-medicao.test.tsx`
- Modify: `apps/mobile/app/(app)/index.tsx`
- Test: `apps/mobile/app/(app)/evolucao-gate.test.tsx` (new; avoids shadowing the `index` route basename in typed-routes)

**Interfaces:**
- Consumes: `assessmentSchema`/`AssessmentValues` (Task 4); `useCreateMyAssessment` (Task 4); `MyEvolutionResponse.canLog` (Task 1); `Screen`/`TextField`/`Button`; `router` from `expo-router`.

- [ ] **Step 1: Regenerate typed routes for the new screen**

Create the file first so the generator sees it:
```bash
printf "export default function NovaMedicao() { return null; }\n" > "apps/mobile/app/(app)/nova-medicao.tsx"
pnpm --filter @nutri-plus/mobile exec npx expo customize tsconfig.json
```
Expected: `.expo/types/router.d.ts` now includes `/nova-medicao`. (This regen is required before `tsc` accepts `router.push('/nova-medicao')`.)

- [ ] **Step 2: Implement the form screen**

Replace `apps/mobile/app/(app)/nova-medicao.tsx` with the full form (mirrors the web fields; uses the RHF+Controller+TextField pattern from `configuracoes/senha.tsx`):

```tsx
import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { CreateAssessmentRequest } from '@nutri-plus/shared-types';
import { assessmentSchema, type AssessmentValues } from '../../lib/validation/assessment';
import { useCreateMyAssessment } from '../../lib/queries/assessments';
import { Screen } from '../../components/ui/screen';
import { TextField } from '../../components/ui/text-field';
import { Button } from '../../components/ui/button';

const today = () => new Date().toISOString().slice(0, 10);

// [key, label] mirroring the web form's fields + order.
const FIELDS: { key: keyof AssessmentValues; label: string }[] = [
  { key: 'weight', label: 'Peso (kg)' },
  { key: 'bodyFatPercentage', label: '% Gordura' },
  { key: 'muscleMass', label: 'Massa muscular (kg)' },
  { key: 'leanMass', label: 'Massa magra (kg)' },
  { key: 'visceralFat', label: 'Gordura visceral' },
  { key: 'basalMetabolicRate', label: 'Taxa metabólica basal' },
  { key: 'bodyWaterPercentage', label: 'Água corporal (%)' },
  { key: 'boneMass', label: 'Massa óssea (kg)' },
  { key: 'metabolicAge', label: 'Idade metabólica' },
  { key: 'waistCircumference', label: 'Cintura (cm)' },
  { key: 'hipCircumference', label: 'Quadril (cm)' },
  { key: 'chestCircumference', label: 'Tórax (cm)' },
  { key: 'armCircumference', label: 'Braço (cm)' },
  { key: 'thighCircumference', label: 'Coxa (cm)' },
];

export default function NovaMedicao() {
  const create = useCreateMyAssessment();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AssessmentValues>({
    resolver: zodResolver(assessmentSchema),
    // All numeric fields start empty (strings); zod coerces on submit.
    defaultValues: { assessmentDate: today() } as unknown as AssessmentValues,
  });

  async function onSubmit(values: AssessmentValues) {
    setFormError(null);
    try {
      await create.mutateAsync(values as CreateAssessmentRequest);
      router.back();
    } catch {
      setFormError('Não foi possível salvar. Tente novamente.');
    }
  }

  return (
    <Screen contentContainerClassName="grow p-6">
      <View className="gap-6">
        <View className="gap-1">
          <Text className="font-heading-semibold text-2xl text-foreground">Nova medição</Text>
          <Text className="font-sans text-base text-muted-foreground">
            Informe ao menos uma métrica.
          </Text>
        </View>

        <View className="gap-4">
          <Controller
            control={control}
            name="assessmentDate"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Data (AAAA-MM-DD)"
                value={(value as string) ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder={today()}
                error={errors.assessmentDate?.message}
              />
            )}
          />

          {FIELDS.map((f) => (
            <Controller
              key={f.key}
              control={control}
              name={f.key}
              render={({ field: { value, onChange, onBlur } }) => (
                <TextField
                  label={f.label}
                  value={value == null ? '' : String(value)}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="numeric"
                  placeholder="—"
                  error={errors[f.key]?.message}
                />
              )}
            />
          ))}

          <Controller
            control={control}
            name="notes"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Observações"
                value={(value as string) ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                multiline
                placeholder="Opcional"
                error={errors.notes?.message}
              />
            )}
          />

          {formError ? <Text className="font-sans text-sm text-destructive">{formError}</Text> : null}

          <Button label="Salvar medição" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />
        </View>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 3: Gate the Evolução screen**

In `apps/mobile/app/(app)/index.tsx`:

Add the router import at the top:
```ts
import { router } from 'expo-router';
```

Destructure `canLog` from the query data (replace the existing destructure):
```ts
  const { name, height, assessments, canLog } = query.data!;
```

In the **empty state** branch (`assessments.length === 0`), add the button inside the centered `<View>` (after the descriptive `<Text>`), gated by `canLog`:
```tsx
          {canLog ? (
            <Button label="Registrar medição" onPress={() => router.push('/nova-medicao')} />
          ) : null}
```

In the **main render**, add a gated button in the header block (after the "Sua evolução" text, inside its `<View className="gap-1">` or right below it):
```tsx
        {canLog ? (
          <Button label="Registrar medição" onPress={() => router.push('/nova-medicao')} />
        ) : null}
```

(`Button` is already imported in this file.)

- [ ] **Step 4: Write the tests**

Create `apps/mobile/app/(app)/nova-medicao.test.tsx`:

```tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mutateAsync = jest.fn();
const back = jest.fn();
jest.mock('expo-router', () => ({ router: { back: () => back() } }));
jest.mock('../../lib/queries/assessments', () => ({
  useCreateMyAssessment: () => ({ mutateAsync, isPending: false }),
}));

import NovaMedicao from './nova-medicao';

describe('NovaMedicao', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    back.mockReset();
  });

  it('submits a metric and navigates back', async () => {
    mutateAsync.mockResolvedValue({ id: 'a1' });
    const { getByLabelText, getByText } = render(<NovaMedicao />);
    fireEvent.changeText(getByLabelText('Peso (kg)'), '80');
    fireEvent.press(getByText('Salvar medição'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toEqual(expect.objectContaining({ weight: 80 }));
    await waitFor(() => expect(back).toHaveBeenCalled());
  });

  it('blocks submit when no metric is provided', async () => {
    const { getByText } = render(<NovaMedicao />);
    fireEvent.press(getByText('Salvar medição'));
    await waitFor(() => expect(getByText('Informe ao menos uma métrica.')).toBeTruthy());
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
```

Create `apps/mobile/app/(app)/evolucao-gate.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';

const useMyEvolution = jest.fn();
jest.mock('../../lib/queries/assessments', () => ({ useMyEvolution: () => useMyEvolution() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import Home from './index';

const base = { name: 'Ana', height: 165, assessments: [] as unknown[] };

describe('Evolução self-log gate', () => {
  it('shows "Registrar medição" when canLog is true', () => {
    useMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: { ...base, canLog: true } });
    const { getByText } = render(<Home />);
    expect(getByText('Registrar medição')).toBeTruthy();
  });

  it('hides it 100% when canLog is false', () => {
    useMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: { ...base, canLog: false } });
    const { queryByText } = render(<Home />);
    expect(queryByText('Registrar medição')).toBeNull();
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @nutri-plus/mobile test -- "nova-medicao|evolucao-gate"`
Expected: PASS (form submit + validation; gate shown/hidden).

- [ ] **Step 6: Typecheck (after the Step 1 regen)**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit`
Expected: clean. If `router.push('/nova-medicao')` errors as an unknown route, re-run the Step 1 `expo customize` command and retry.

- [ ] **Step 7: Full mobile suite**

Run: `pnpm --filter @nutri-plus/mobile test`
Expected: PASS — full suite green.

- [ ] **Step 8: Commit**

```bash
git add "apps/mobile/app/(app)/nova-medicao.tsx" "apps/mobile/app/(app)/nova-medicao.test.tsx" "apps/mobile/app/(app)/index.tsx" "apps/mobile/app/(app)/evolucao-gate.test.tsx"
git commit -m "feat(mobile): self-log bioimpedance form + gated Evolução entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review notes (coverage vs spec)

- **Flag + default false** → Task 1 (Prisma) ✓
- **shared-types (`canLog`, patient flag)** → Task 1 ✓
- **Gated `POST /me/assessments` (403 when off)** → Task 2 ✓
- **`canLog` in evolution response** → Task 2 ✓
- **Nutritionist sets the flag (web edit form + DTO)** → Task 2 (DTO) + Task 3 (web) ✓
- **Mobile form mirrors web fields/validation exactly** → Task 4 (schema, verbatim copy) + Task 5 (form) ✓
- **Mobile gate: shown when on, 100% hidden when off** → Task 5 ✓
- **Defense-in-depth (API enforces independent of UI)** → Task 2 (service throws) ✓
- **typedRoutes regen; no `_layout` test names** → Task 5 Step 1 + test filenames ✓
