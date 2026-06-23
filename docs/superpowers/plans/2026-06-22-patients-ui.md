# Patients UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the patients module UI — list (`/patients`), create (`/patients/new`), and detail/edit (`/patients/[id]`) — wired to `/v1/patients` via React Query, with a post-create flow that defers bioimpedância.

**Architecture:** Thin server page files render client feature components that use React Query hooks over a browser-token API layer. Shared types live in `@nutri-plus/shared-types`; forms use react-hook-form + zod with shadcn primitives. The clinical field sections are a single shared component reused by the create and edit forms.

**Tech Stack:** Next.js 16 (App Router) + React 19, `@tanstack/react-query`, `@supabase/ssr`, shadcn/ui (form, input, select, textarea, table, badge), `react-hook-form` + `zod` (v3), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-22-patients-ui-design.md`
**Branch:** `feat/patients-ui` (spec committed).

## Global Constraints

- **Quotes:** single quotes (repo standard) in all new/edited TS/TSX.
- **Copy:** pt-BR. Route slugs English: `/patients`, `/patients/new`, `/patients/[id]`.
- **Data:** React Query client-side; token from the browser Supabase session via `browserApiFetch`. Never read the service-role key.
- **Enums** (mirror the API): `Gender` MALE/FEMALE/OTHER/PREFER_NOT_TO_SAY · `PatientObjective` WEIGHT_LOSS/MUSCLE_GAIN/MAINTENANCE/RECOMPOSITION · `ActivityLevel` SEDENTARY/LIGHT/MODERATE/ACTIVE/VERY_ACTIVE.
- **pt-BR labels:** objective → Perda de peso / Ganho de massa / Manutenção / Recomposição · activity → Sedentário / Leve / Moderado / Ativo / Muito ativo · gender → Masculino / Feminino / Outro / Prefiro não informar.
- **Create vs Update:** create requires `name` + `email` (which invites the patient by email) + optional clinical; update PATCHes clinical fields only (name/email not editable). Empty optional fields are omitted from the request (not sent as `''`).
- **Bioimpedância (`BodyAssessment`) is deferred** — the post-create banner + a placeholder section exist now, shown as "em breve"; no live action.
- **After create:** redirect to `/patients/[id]?created=1`.
- **Commits** end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared-types/src/v1/patient.ts` (+ index export) | Enums + `PatientSummary`/`PatientDetail`/`Create`/`Update` request types |
| `apps/web/src/lib/patients/labels.ts` | pt-BR label maps for the enums |
| `apps/web/src/lib/validation/patient.ts` | `createPatientSchema`, `updatePatientSchema` + inferred types |
| `apps/web/src/components/ui/{select,textarea,table,badge}.tsx` | shadcn primitives (generated) |
| `apps/web/src/lib/api/browser.ts` | `browserToken()` + `browserApiFetch()` |
| `apps/web/src/lib/api/patients.ts` | `listPatients`/`getPatient`/`createPatient`/`updatePatient` |
| `apps/web/src/lib/queries/patients.ts` | React Query hooks |
| `apps/web/src/components/patients/patient-clinical-fields.tsx` | The Pessoal/Medidas/Saúde field sections (shared) |
| `apps/web/src/components/patients/create-patient-form.tsx` | Create form (name+email + clinical) |
| `apps/web/src/components/patients/edit-patient-form.tsx` | Edit form (clinical PATCH) |
| `apps/web/src/components/patients/patients-list.tsx` | List table + loading/empty/error states |
| `apps/web/src/components/patients/bioimpedance-section.tsx` | "Em breve" placeholder |
| `apps/web/src/components/patients/created-banner.tsx` | Post-create banner (dismissable) |
| `apps/web/src/components/patients/patient-detail.tsx` | Detail client: header + edit form + bioimpedância + banner |
| `apps/web/src/app/(app)/patients/page.tsx` (replace) | Renders `<PatientsList/>` |
| `apps/web/src/app/(app)/patients/new/page.tsx` | Renders `<CreatePatientForm/>` |
| `apps/web/src/app/(app)/patients/[id]/page.tsx` | Awaits params+searchParams → `<PatientDetail/>` |

---

## Task 1: Shared types + validation schemas + labels

**Files:**
- Create: `packages/shared-types/src/v1/patient.ts`; Modify: `packages/shared-types/src/v1/index.ts`
- Create: `apps/web/src/lib/patients/labels.ts`
- Create: `apps/web/src/lib/validation/patient.ts`; Test: `apps/web/src/lib/validation/patient.test.ts`

**Interfaces:**
- Produces: from `@nutri-plus/shared-types` — enums `Gender`/`PatientObjective`/`ActivityLevel`, interfaces `PatientUserSummary`/`PatientSummary`/`PatientDetail`/`CreatePatientRequest`/`UpdatePatientRequest`. From `@/lib/validation/patient` — `createPatientSchema`/`updatePatientSchema` + `CreatePatientValues`/`UpdatePatientValues`. From `@/lib/patients/labels` — `OBJECTIVE_LABELS`/`ACTIVITY_LABELS`/`GENDER_LABELS`.

- [ ] **Step 1: Create `packages/shared-types/src/v1/patient.ts`**

```ts
export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY',
}

export enum PatientObjective {
  WEIGHT_LOSS = 'WEIGHT_LOSS',
  MUSCLE_GAIN = 'MUSCLE_GAIN',
  MAINTENANCE = 'MAINTENANCE',
  RECOMPOSITION = 'RECOMPOSITION',
}

export enum ActivityLevel {
  SEDENTARY = 'SEDENTARY',
  LIGHT = 'LIGHT',
  MODERATE = 'MODERATE',
  ACTIVE = 'ACTIVE',
  VERY_ACTIVE = 'VERY_ACTIVE',
}

export interface PatientUserSummary {
  id: string;
  name: string;
  email: string;
}

// Dates are ISO strings over the wire.
export interface PatientSummary {
  id: string;
  user: PatientUserSummary;
  nutritionistId: string | null;
  birthDate: string | null;
  gender: Gender | null;
  height: number | null;
  targetWeight: number | null;
  objective: PatientObjective | null;
  activityLevel: ActivityLevel | null;
  restrictions: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// assessments typed loosely until the bioimpedância slice.
export interface PatientDetail extends PatientSummary {
  assessments: unknown[];
}

export interface CreatePatientRequest {
  name: string;
  email: string;
  birthDate?: string;
  gender?: Gender;
  height?: number;
  targetWeight?: number;
  objective?: PatientObjective;
  activityLevel?: ActivityLevel;
  restrictions?: string;
  allergies?: string;
  medicalConditions?: string;
  notes?: string;
}

export type UpdatePatientRequest = Omit<CreatePatientRequest, 'name' | 'email'>;
```

- [ ] **Step 2: Export it from `packages/shared-types/src/v1/index.ts`** (append)

```ts
export * from './patient';
```

- [ ] **Step 3: Build shared-types so the web resolves the new types**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: succeeds; `dist/v1/patient.d.ts` exists.

- [ ] **Step 4: Create `apps/web/src/lib/patients/labels.ts`**

```ts
import { ActivityLevel, Gender, PatientObjective } from '@nutri-plus/shared-types';

export const OBJECTIVE_LABELS: Record<PatientObjective, string> = {
  [PatientObjective.WEIGHT_LOSS]: 'Perda de peso',
  [PatientObjective.MUSCLE_GAIN]: 'Ganho de massa',
  [PatientObjective.MAINTENANCE]: 'Manutenção',
  [PatientObjective.RECOMPOSITION]: 'Recomposição',
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  [ActivityLevel.SEDENTARY]: 'Sedentário',
  [ActivityLevel.LIGHT]: 'Leve',
  [ActivityLevel.MODERATE]: 'Moderado',
  [ActivityLevel.ACTIVE]: 'Ativo',
  [ActivityLevel.VERY_ACTIVE]: 'Muito ativo',
};

export const GENDER_LABELS: Record<Gender, string> = {
  [Gender.MALE]: 'Masculino',
  [Gender.FEMALE]: 'Feminino',
  [Gender.OTHER]: 'Outro',
  [Gender.PREFER_NOT_TO_SAY]: 'Prefiro não informar',
};
```

- [ ] **Step 5: Write the failing test `apps/web/src/lib/validation/patient.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createPatientSchema, updatePatientSchema } from './patient';

describe('createPatientSchema', () => {
  it('accepts name + email with empty clinical fields', () => {
    const r = createPatientSchema.safeParse({ name: 'Maria Silva', email: 'maria@x.com' });
    expect(r.success).toBe(true);
  });
  it('requires a name and a valid email', () => {
    expect(createPatientSchema.safeParse({ name: 'M', email: 'maria@x.com' }).success).toBe(false);
    expect(createPatientSchema.safeParse({ name: 'Maria', email: 'nope' }).success).toBe(false);
  });
  it('coerces height and rejects non-positive', () => {
    const ok = createPatientSchema.safeParse({ name: 'Maria', email: 'm@x.com', height: '170' });
    expect(ok.success && ok.data.height).toBe(170);
    expect(createPatientSchema.safeParse({ name: 'Maria', email: 'm@x.com', height: '0' }).success).toBe(false);
  });
  it('treats empty optional strings as omitted', () => {
    const r = createPatientSchema.safeParse({ name: 'Maria', email: 'm@x.com', notes: '', gender: '' });
    expect(r.success && r.data.notes).toBeUndefined();
    expect(r.success && r.data.gender).toBeUndefined();
  });
  it('rejects a future birthDate', () => {
    expect(
      createPatientSchema.safeParse({ name: 'Maria', email: 'm@x.com', birthDate: '2999-01-01' }).success,
    ).toBe(false);
  });
});

describe('updatePatientSchema', () => {
  it('accepts an all-empty (no-op) update', () => {
    expect(updatePatientSchema.safeParse({}).success).toBe(true);
  });
  it('validates an enum value', () => {
    expect(updatePatientSchema.safeParse({ objective: 'WEIGHT_LOSS' }).success).toBe(true);
    expect(updatePatientSchema.safeParse({ objective: 'NOPE' }).success).toBe(false);
  });
});
```

- [ ] **Step 6: Run, verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- validation/patient`
Expected: FAIL (cannot find `./patient`).

- [ ] **Step 7: Implement `apps/web/src/lib/validation/patient.ts`**

```ts
import { z } from 'zod';
import { ActivityLevel, Gender, PatientObjective } from '@nutri-plus/shared-types';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().max(max, `Máximo de ${max} caracteres.`).optional());

const optionalPositive = z.preprocess(
  emptyToUndefined,
  z.coerce.number().positive('Deve ser maior que zero.').optional(),
);

const optionalBirthDate = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida.')
    .refine((v) => new Date(v) <= new Date(), 'A data não pode ser futura.')
    .optional(),
);

const clinicalShape = {
  birthDate: optionalBirthDate,
  gender: z.preprocess(emptyToUndefined, z.nativeEnum(Gender).optional()),
  height: optionalPositive,
  targetWeight: optionalPositive,
  objective: z.preprocess(emptyToUndefined, z.nativeEnum(PatientObjective).optional()),
  activityLevel: z.preprocess(emptyToUndefined, z.nativeEnum(ActivityLevel).optional()),
  restrictions: optionalText(2000),
  allergies: optionalText(2000),
  medicalConditions: optionalText(2000),
  notes: optionalText(2000),
};

export const updatePatientSchema = z.object(clinicalShape);

export const createPatientSchema = z.object({
  name: z.string().min(2, 'Informe o nome do paciente.').max(200),
  email: z.string().email('Informe um e-mail válido.').max(320),
  ...clinicalShape,
});

export type CreatePatientValues = z.infer<typeof createPatientSchema>;
export type UpdatePatientValues = z.infer<typeof updatePatientSchema>;
```

- [ ] **Step 8: Run, verify pass + tsc**

Run: `pnpm --filter @nutri-plus/web test -- validation/patient && pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: tests pass; tsc clean.

- [ ] **Step 9: Commit**

```bash
git add packages/shared-types apps/web/src/lib/patients apps/web/src/lib/validation/patient.ts apps/web/src/lib/validation/patient.test.ts
git commit -m "feat(web): patient shared-types + zod schemas + pt-BR labels

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Add shadcn components (select, textarea, table, badge)

**Files:**
- Create (generated): `apps/web/src/components/ui/{select,textarea,table,badge}.tsx`

**Interfaces:**
- Produces: shadcn `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`, `Textarea`, `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`, `Badge` from `@/components/ui/*`.

- [ ] **Step 1: Add the components**

```bash
cd apps/web && pnpm dlx shadcn@latest add select textarea table badge && cd ../..
```

Expected: the four `ui/*.tsx` files are created (+ any deps). If a component isn't in the configured style's registry, hand-author it from the canonical shadcn source (as was done for `form`); report which one if so.

- [ ] **Step 2: Verify build + existing tests**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit && pnpm --filter @nutri-plus/web test`
Expected: tsc clean; all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add shadcn select, textarea, table, badge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Browser API layer + patients API + React Query hooks

**Files:**
- Create: `apps/web/src/lib/api/browser.ts`; Test: `apps/web/src/lib/api/browser.test.ts`
- Create: `apps/web/src/lib/api/patients.ts`; Test: `apps/web/src/lib/api/patients.test.ts`
- Create: `apps/web/src/lib/queries/patients.ts`

**Interfaces:**
- Consumes: `apiFetch` (`@/lib/api/client`), browser `createClient` (`@/lib/supabase/client`), the patient types.
- Produces: `browserToken()`, `browserApiFetch<T>(path, opts?)` (`@/lib/api/browser`); `listPatients`/`getPatient`/`createPatient`/`updatePatient` (`@/lib/api/patients`); `usePatients`/`usePatient`/`useCreatePatient`/`useUpdatePatient` (`@/lib/queries/patients`).

- [ ] **Step 1: Write the failing test `apps/web/src/lib/api/browser.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
const apiFetch = vi.fn();

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getSession } }) }));
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { browserApiFetch, browserToken } from './browser';

beforeEach(() => {
  getSession.mockReset();
  apiFetch.mockReset();
});

describe('browser API', () => {
  it('attaches the session token to apiFetch', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    apiFetch.mockResolvedValue({ ok: true });
    const result = await browserApiFetch('/patients', { method: 'POST', body: { a: 1 } });
    expect(result).toEqual({ ok: true });
    expect(apiFetch).toHaveBeenCalledWith('/patients', { token: 'tok', method: 'POST', body: { a: 1 } });
  });
  it('throws when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(browserToken()).rejects.toThrow(/sess/i);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- api/browser`
Expected: FAIL (cannot find `./browser`).

- [ ] **Step 3: Implement `apps/web/src/lib/api/browser.ts`**

```ts
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/api/client';

export async function browserToken(): Promise<string> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sessão expirada. Entre novamente.');
  }
  return session.access_token;
}

export async function browserApiFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await browserToken();
  return apiFetch<T>(path, { token, ...opts });
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @nutri-plus/web test -- api/browser`
Expected: 2 passing.

- [ ] **Step 5: Write the failing test `apps/web/src/lib/api/patients.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({ browserApiFetch: (...a: unknown[]) => browserApiFetch(...a) }));

import { createPatient, getPatient, listPatients, updatePatient } from './patients';

beforeEach(() => browserApiFetch.mockReset());

describe('patients API', () => {
  it('lists patients', async () => {
    await listPatients();
    expect(browserApiFetch).toHaveBeenCalledWith('/patients');
  });
  it('gets one patient', async () => {
    await getPatient('p1');
    expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1');
  });
  it('creates a patient via POST', async () => {
    await createPatient({ name: 'Maria', email: 'm@x.com' });
    expect(browserApiFetch).toHaveBeenCalledWith('/patients', {
      method: 'POST',
      body: { name: 'Maria', email: 'm@x.com' },
    });
  });
  it('updates a patient via PATCH', async () => {
    await updatePatient('p1', { notes: 'ok' });
    expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1', { method: 'PATCH', body: { notes: 'ok' } });
  });
});
```

- [ ] **Step 6: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- api/patients`
Expected: FAIL.

- [ ] **Step 7: Implement `apps/web/src/lib/api/patients.ts`**

```ts
import type {
  CreatePatientRequest,
  PatientDetail,
  PatientSummary,
  UpdatePatientRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listPatients(): Promise<PatientSummary[]> {
  return browserApiFetch<PatientSummary[]>('/patients');
}

export function getPatient(id: string): Promise<PatientDetail> {
  return browserApiFetch<PatientDetail>(`/patients/${id}`);
}

export function createPatient(body: CreatePatientRequest): Promise<PatientDetail> {
  return browserApiFetch<PatientDetail>('/patients', { method: 'POST', body });
}

export function updatePatient(id: string, body: UpdatePatientRequest): Promise<PatientDetail> {
  return browserApiFetch<PatientDetail>(`/patients/${id}`, { method: 'PATCH', body });
}
```

- [ ] **Step 8: Run, verify pass**

Run: `pnpm --filter @nutri-plus/web test -- api/patients`
Expected: 4 passing.

- [ ] **Step 9: Implement `apps/web/src/lib/queries/patients.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePatientRequest, UpdatePatientRequest } from '@nutri-plus/shared-types';
import { createPatient, getPatient, listPatients, updatePatient } from '@/lib/api/patients';

export function usePatients() {
  return useQuery({ queryKey: ['patients'], queryFn: listPatients });
}

export function usePatient(id: string) {
  return useQuery({ queryKey: ['patient', id], queryFn: () => getPatient(id), enabled: Boolean(id) });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePatientRequest) => createPatient(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patients'] }),
  });
}

export function useUpdatePatient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePatientRequest) => updatePatient(id, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.setQueryData(['patient', id], data);
    },
  });
}
```

- [ ] **Step 10: Verify tsc + commit**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: clean.

```bash
git add apps/web/src/lib/api/browser.ts apps/web/src/lib/api/browser.test.ts apps/web/src/lib/api/patients.ts apps/web/src/lib/api/patients.test.ts apps/web/src/lib/queries/patients.ts
git commit -m "feat(web): browser API layer + patients API + React Query hooks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Shared clinical fields + create form + new page

**Files:**
- Create: `apps/web/src/components/patients/patient-clinical-fields.tsx`
- Create: `apps/web/src/components/patients/create-patient-form.tsx`; Test: `apps/web/src/components/patients/create-patient-form.test.tsx`
- Create: `apps/web/src/app/(app)/patients/new/page.tsx`

**Interfaces:**
- Consumes: the shadcn `Form`/`Input`/`Select`/`Textarea`/`Button`, the schemas + labels, `useCreatePatient`, `mapAuthError` is NOT used here; map API errors inline.
- Produces: `<PatientClinicalFields control={Control} />` (`@/components/patients/patient-clinical-fields`); `<CreatePatientForm />` (`@/components/patients/create-patient-form`).

> **jsdom + Radix Select note:** the clinical fields render shadcn `Select` (Radix). Rendering them *closed* (as these tests do) is usually fine, but if a test throws on `hasPointerCapture`/`scrollIntoView`/`ResizeObserver`, append these polyfills to `apps/web/vitest.setup.ts` (and include it in this task's commit):
> ```ts
> if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
> if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
> if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
> if (typeof ResizeObserver === 'undefined') {
>   globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
> }
> ```

- [ ] **Step 1: Implement `apps/web/src/components/patients/patient-clinical-fields.tsx`**

```tsx
'use client';

import type { Control } from 'react-hook-form';
import { ActivityLevel, Gender, PatientObjective } from '@nutri-plus/shared-types';
import { ACTIVITY_LABELS, GENDER_LABELS, OBJECTIVE_LABELS } from '@/lib/patients/labels';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

// Shared by the create and edit forms. The clinical field names are a strict
// subset shared by createPatientSchema and updatePatientSchema, so a loose
// Control type keeps this reusable across both form value shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PatientClinicalFields({ control }: { control: Control<any> }) {
  return (
    <>
      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 font-heading text-sm font-semibold text-[#0a5c45]">Pessoal</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={control}
            name="birthDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data de nascimento</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="gender"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gênero</FormLabel>
                <Select value={field.value || ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(Gender).map((g) => (
                      <SelectItem key={g} value={g}>
                        {GENDER_LABELS[g]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 font-heading text-sm font-semibold text-[#0a5c45]">Medidas &amp; objetivo</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={control}
            name="height"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Altura (cm)</FormLabel>
                <FormControl>
                  <Input type="number" inputMode="numeric" placeholder="Ex: 170" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="targetWeight"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Peso-alvo (kg)</FormLabel>
                <FormControl>
                  <Input type="number" inputMode="numeric" placeholder="Ex: 68" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="objective"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Objetivo</FormLabel>
                <Select value={field.value || ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(PatientObjective).map((o) => (
                      <SelectItem key={o} value={o}>
                        {OBJECTIVE_LABELS[o]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="activityLevel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nível de atividade</FormLabel>
                <Select value={field.value || ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(ActivityLevel).map((a) => (
                      <SelectItem key={a} value={a}>
                        {ACTIVITY_LABELS[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 font-heading text-sm font-semibold text-[#0a5c45]">Saúde</h3>
        <div className="grid gap-4">
          {(
            [
              ['restrictions', 'Restrições alimentares'],
              ['allergies', 'Alergias'],
              ['medicalConditions', 'Condições médicas'],
              ['notes', 'Observações'],
            ] as const
          ).map(([name, label]) => (
            <FormField
              key={name}
              control={control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Write the failing test `apps/web/src/components/patients/create-patient-form.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const mutateAsync = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('@/lib/queries/patients', () => ({
  useCreatePatient: () => ({ mutateAsync, isPending: false }),
}));

import { CreatePatientForm } from './create-patient-form';

beforeEach(() => {
  push.mockReset();
  mutateAsync.mockReset();
});

describe('CreatePatientForm', () => {
  it('blocks submit and shows errors when name/email are missing', async () => {
    render(<CreatePatientForm />);
    await userEvent.click(screen.getByRole('button', { name: /criar paciente/i }));
    expect(await screen.findByText(/informe o nome/i)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('creates the patient and redirects to its page with ?created=1', async () => {
    mutateAsync.mockResolvedValue({ id: 'p-new' });
    render(<CreatePatientForm />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Maria Silva');
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'maria@x.com');
    await userEvent.click(screen.getByRole('button', { name: /criar paciente/i }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Maria Silva', email: 'maria@x.com' }),
      ),
    );
    expect(push).toHaveBeenCalledWith('/patients/p-new?created=1');
  });

  it('shows a mapped error when creation fails', async () => {
    mutateAsync.mockRejectedValue(
      Object.assign(new Error('x'), { name: 'ApiError', status: 409, body: {} }),
    );
    render(<CreatePatientForm />);
    await userEvent.type(screen.getByLabelText(/nome/i), 'Maria Silva');
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'maria@x.com');
    await userEvent.click(screen.getByRole('button', { name: /criar paciente/i }));
    expect(await screen.findByText(/já existe/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- create-patient-form`
Expected: FAIL.

- [ ] **Step 4: Implement `apps/web/src/components/patients/create-patient-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createPatientSchema, type CreatePatientValues } from '@/lib/validation/patient';
import { useCreatePatient } from '@/lib/queries/patients';
import { ApiError } from '@/lib/api/client';
import { PatientClinicalFields } from '@/components/patients/patient-clinical-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

function mapCreateError(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) {
    return 'Já existe um usuário com este e-mail.';
  }
  return 'Não foi possível criar o paciente. Tente novamente.';
}

export function CreatePatientForm() {
  const router = useRouter();
  const create = useCreatePatient();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CreatePatientValues>({
    resolver: zodResolver(createPatientSchema),
    defaultValues: {
      name: '',
      email: '',
      birthDate: '',
      gender: '',
      height: '',
      targetWeight: '',
      objective: '',
      activityLevel: '',
      restrictions: '',
      allergies: '',
      medicalConditions: '',
      notes: '',
    } as unknown as CreatePatientValues,
  });

  async function onSubmit(values: CreatePatientValues) {
    setFormError(null);
    try {
      const created = await create.mutateAsync(values);
      router.push(`/patients/${created.id}?created=1`);
    } catch (err) {
      setFormError(mapCreateError(err));
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/patients" className="text-sm text-muted-foreground hover:underline">
        ‹ Voltar para pacientes
      </Link>
      <h1 className="mt-2 mb-5 font-heading text-2xl font-bold">Novo paciente</h1>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <section className="rounded-xl border bg-card p-5">
            <h3 className="mb-4 font-heading text-sm font-semibold text-[#0a5c45]">Dados do paciente</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome completo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="paciente@email.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              O paciente receberá um convite por e-mail para acessar a conta.
            </p>
          </section>

          <PatientClinicalFields control={form.control} />

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" className="rounded-full" asChild>
              <Link href="/patients">Cancelar</Link>
            </Button>
            <Button type="submit" className="rounded-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Criando…' : 'Criar paciente'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
```

- [ ] **Step 5: Implement `apps/web/src/app/(app)/patients/new/page.tsx`**

```tsx
import { CreatePatientForm } from '@/components/patients/create-patient-form';

export default function NewPatientPage() {
  return <CreatePatientForm />;
}
```

- [ ] **Step 6: Run, verify pass + tsc**

Run: `pnpm --filter @nutri-plus/web test -- create-patient-form && pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: 3 passing; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/patients/patient-clinical-fields.tsx apps/web/src/components/patients/create-patient-form.tsx apps/web/src/components/patients/create-patient-form.test.tsx "apps/web/src/app/(app)/patients/new"
git commit -m "feat(web): create-patient form + shared clinical fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Patients list + page

**Files:**
- Create: `apps/web/src/components/patients/patients-list.tsx`; Test: `apps/web/src/components/patients/patients-list.test.tsx`
- Modify (replace stub): `apps/web/src/app/(app)/patients/page.tsx`

**Interfaces:**
- Consumes: `usePatients`, the labels, shadcn `Table`/`Badge`/`Button`/`Skeleton`.
- Produces: `<PatientsList />` (`@/components/patients/patients-list`).

- [ ] **Step 1: Write the failing test `apps/web/src/components/patients/patients-list.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const usePatients = vi.fn();
vi.mock('@/lib/queries/patients', () => ({ usePatients: () => usePatients() }));

import { PatientsList } from './patients-list';

const patient = {
  id: 'p1',
  user: { id: 'u1', name: 'Maria Silva', email: 'maria@x.com' },
  objective: 'WEIGHT_LOSS',
  activityLevel: 'MODERATE',
  createdAt: '2026-05-12T00:00:00.000Z',
};

describe('PatientsList', () => {
  it('shows a loading state', () => {
    usePatients.mockReturnValue({ isLoading: true });
    render(<PatientsList />);
    expect(screen.getByTestId('patients-loading')).toBeInTheDocument();
  });
  it('shows an empty state with a create CTA', () => {
    usePatients.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<PatientsList />);
    expect(screen.getByText(/nenhum paciente/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /novo paciente/i })).toHaveAttribute('href', '/patients/new');
  });
  it('shows an error state', () => {
    usePatients.mockReturnValue({ isLoading: false, isError: true });
    render(<PatientsList />);
    expect(screen.getByText(/erro ao carregar/i)).toBeInTheDocument();
  });
  it('renders a row linking to the patient with a pt-BR objective', () => {
    usePatients.mockReturnValue({ isLoading: false, isError: false, data: [patient] });
    render(<PatientsList />);
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('Perda de peso')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /maria silva/i })).toHaveAttribute('href', '/patients/p1');
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- patients-list`
Expected: FAIL.

- [ ] **Step 3: Implement `apps/web/src/components/patients/patients-list.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePatients } from '@/lib/queries/patients';
import { ACTIVITY_LABELS, OBJECTIVE_LABELS } from '@/lib/patients/labels';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function PatientsList() {
  const query = usePatients();

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Pacientes</h1>
          {query.data && (
            <p className="mt-1 text-sm text-muted-foreground">
              {query.data.length} {query.data.length === 1 ? 'paciente' : 'pacientes'}
            </p>
          )}
        </div>
        <Button className="rounded-full" asChild>
          <Link href="/patients/new">+ Novo paciente</Link>
        </Button>
      </div>

      {query.isLoading && (
        <div data-testid="patients-loading" className="space-y-2 rounded-xl border bg-card p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar os pacientes.{' '}
          <button onClick={() => query.refetch()} className="font-semibold text-primary hover:underline">
            Tentar de novo
          </button>
        </div>
      )}

      {query.data && query.data.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="font-medium">Nenhum paciente ainda</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Cadastre seu primeiro paciente para começar a acompanhá-lo.
          </p>
          <Button className="rounded-full" asChild>
            <Link href="/patients/new">Cadastrar primeiro paciente</Link>
          </Button>
        </div>
      )}

      {query.data && query.data.length > 0 && (
        <>
        {/* Mobile: stacked cards */}
        <div className="space-y-3 md:hidden">
          {query.data.map((p) => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="flex items-center gap-3 rounded-xl border bg-card p-4"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                {initials(p.user.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.user.name}</span>
                <span className="block truncate text-sm text-muted-foreground">{p.user.email}</span>
              </span>
              {p.objective && <Badge variant="secondary">{OBJECTIVE_LABELS[p.objective]}</Badge>}
            </Link>
          ))}
        </div>

        {/* Desktop: table */}
        <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Paciente</th>
                <th className="px-4 py-3 font-semibold">E-mail</th>
                <th className="px-4 py-3 font-semibold">Objetivo</th>
                <th className="px-4 py-3 font-semibold">Atividade</th>
                <th className="px-4 py-3 font-semibold">Desde</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link href={`/patients/${p.id}`} className="flex items-center gap-3 font-semibold">
                      <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                        {initials(p.user.name)}
                      </span>
                      {p.user.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.user.email}</td>
                  <td className="px-4 py-3">
                    {p.objective ? <Badge variant="secondary">{OBJECTIVE_LABELS[p.objective]}</Badge> : '—'}
                  </td>
                  <td className="px-4 py-3">{p.activityLevel ? ACTIVITY_LABELS[p.activityLevel] : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Replace `apps/web/src/app/(app)/patients/page.tsx`**

```tsx
import { PatientsList } from '@/components/patients/patients-list';

export default function PatientsPage() {
  return <PatientsList />;
}
```

- [ ] **Step 5: Run, verify pass + tsc**

Run: `pnpm --filter @nutri-plus/web test -- patients-list && pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: 4 passing; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/patients/patients-list.tsx apps/web/src/components/patients/patients-list.test.tsx "apps/web/src/app/(app)/patients/page.tsx"
git commit -m "feat(web): patients list page (table + loading/empty/error)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Bioimpedância placeholder + post-create banner

**Files:**
- Create: `apps/web/src/components/patients/bioimpedance-section.tsx`
- Create: `apps/web/src/components/patients/created-banner.tsx`; Test: `apps/web/src/components/patients/created-banner.test.tsx`

**Interfaces:**
- Produces: `<BioimpedanceSection />` (static placeholder); `<CreatedBanner show={boolean} />` (`@/components/patients/created-banner`) — renders when `show`, a disabled "Prosseguir para bioimpedância" + a "Deixar para depois" that dismisses (local state).

- [ ] **Step 1: Write the failing test `apps/web/src/components/patients/created-banner.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreatedBanner } from './created-banner';

describe('CreatedBanner', () => {
  it('renders nothing when show is false', () => {
    const { container } = render(<CreatedBanner show={false} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('shows the success message with a disabled bioimpedância CTA', () => {
    render(<CreatedBanner show />);
    expect(screen.getByText(/criado e convidado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bioimped/i })).toBeDisabled();
  });
  it('dismisses when "Deixar para depois" is clicked', async () => {
    render(<CreatedBanner show />);
    await userEvent.click(screen.getByRole('button', { name: /deixar para depois/i }));
    expect(screen.queryByText(/criado e convidado/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- created-banner`
Expected: FAIL.

- [ ] **Step 3: Implement `apps/web/src/components/patients/created-banner.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function CreatedBanner({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  if (!show || dismissed) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-secondary/60 p-4">
      <div className="flex-1">
        <p className="font-semibold">Paciente criado e convidado por e-mail</p>
        <p className="text-sm text-muted-foreground">Quer registrar a primeira bioimpedância agora?</p>
      </div>
      <div className="flex gap-2">
        <Button className="rounded-full" disabled title="Em breve">
          Prosseguir para bioimpedância
        </Button>
        <Button variant="outline" className="rounded-full" onClick={() => setDismissed(true)}>
          Deixar para depois
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `apps/web/src/components/patients/bioimpedance-section.tsx`**

```tsx
export function BioimpedanceSection() {
  return (
    <section>
      <h2 className="mb-2 font-heading text-base font-bold">Bioimpedância</h2>
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card p-8 text-center">
        <p className="font-medium">Nenhuma avaliação ainda</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Em breve você poderá registrar bioimpedância (peso, % de gordura, massa magra,
          circunferências…) e acompanhar a evolução.
        </p>
        <span className="mt-1 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
          Em breve
        </span>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @nutri-plus/web test -- created-banner`
Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/patients/bioimpedance-section.tsx apps/web/src/components/patients/created-banner.tsx apps/web/src/components/patients/created-banner.test.tsx
git commit -m "feat(web): bioimpedância placeholder + post-create banner

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Patient detail/edit page

**Files:**
- Create: `apps/web/src/components/patients/edit-patient-form.tsx`
- Create: `apps/web/src/components/patients/patient-detail.tsx`; Test: `apps/web/src/components/patients/patient-detail.test.tsx`
- Create: `apps/web/src/app/(app)/patients/[id]/page.tsx`

**Interfaces:**
- Consumes: `usePatient`/`useUpdatePatient`, `PatientClinicalFields`, `BioimpedanceSection`, `CreatedBanner`, `updatePatientSchema`, `sonner` `toast`, the patient types.
- Produces: `<EditPatientForm patient={PatientDetail} />`; `<PatientDetail id={string} created={boolean} />` (`@/components/patients/patient-detail`).

- [ ] **Step 1: Implement `apps/web/src/components/patients/edit-patient-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { PatientDetail } from '@nutri-plus/shared-types';
import { updatePatientSchema, type UpdatePatientValues } from '@/lib/validation/patient';
import { useUpdatePatient } from '@/lib/queries/patients';
import { PatientClinicalFields } from '@/components/patients/patient-clinical-fields';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';

function toDefaults(p: PatientDetail): UpdatePatientValues {
  return {
    birthDate: p.birthDate ? p.birthDate.slice(0, 10) : '',
    gender: p.gender ?? '',
    height: p.height ?? '',
    targetWeight: p.targetWeight ?? '',
    objective: p.objective ?? '',
    activityLevel: p.activityLevel ?? '',
    restrictions: p.restrictions ?? '',
    allergies: p.allergies ?? '',
    medicalConditions: p.medicalConditions ?? '',
    notes: p.notes ?? '',
  } as unknown as UpdatePatientValues;
}

export function EditPatientForm({ patient }: { patient: PatientDetail }) {
  const update = useUpdatePatient(patient.id);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<UpdatePatientValues>({
    resolver: zodResolver(updatePatientSchema),
    defaultValues: toDefaults(patient),
  });

  async function onSubmit(values: UpdatePatientValues) {
    setFormError(null);
    try {
      await update.mutateAsync(values);
      toast.success('Perfil atualizado.');
    } catch {
      setFormError('Não foi possível salvar. Tente novamente.');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <PatientClinicalFields control={form.control} />
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <div className="flex justify-end">
          <Button type="submit" className="rounded-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: Write the failing test `apps/web/src/components/patients/patient-detail.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const usePatient = vi.fn();
const mutateAsync = vi.fn();

vi.mock('@/lib/queries/patients', () => ({
  usePatient: (id: string) => usePatient(id),
  useUpdatePatient: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

import { PatientDetail } from './patient-detail';

const patient = {
  id: 'p1',
  user: { id: 'u1', name: 'Maria Silva', email: 'maria@x.com' },
  birthDate: '1991-03-14T00:00:00.000Z',
  gender: 'FEMALE',
  height: 165,
  targetWeight: 62,
  objective: 'WEIGHT_LOSS',
  activityLevel: 'MODERATE',
  restrictions: null,
  allergies: null,
  medicalConditions: null,
  notes: null,
  nutritionistId: 'n1',
  createdAt: '2026-05-12T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  assessments: [],
};

beforeEach(() => {
  usePatient.mockReset();
  mutateAsync.mockReset();
});

describe('PatientDetail', () => {
  it('shows a not-found state on 404', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: true, error: { status: 404 } });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByText(/não encontrado/i)).toBeInTheDocument();
  });

  it('renders the read-only header and the bioimpedância placeholder', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    render(<PatientDetail id="p1" created={false} />);
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('maria@x.com')).toBeInTheDocument();
    expect(screen.getByText(/nenhuma avaliação ainda/i)).toBeInTheDocument();
  });

  it('shows the post-create banner only when created', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    const { rerender } = render(<PatientDetail id="p1" created={false} />);
    expect(screen.queryByText(/criado e convidado/i)).not.toBeInTheDocument();
    rerender(<PatientDetail id="p1" created />);
    expect(screen.getByText(/criado e convidado/i)).toBeInTheDocument();
  });

  it('saves clinical edits via updatePatient', async () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    mutateAsync.mockResolvedValue(patient);
    render(<PatientDetail id="p1" created={false} />);
    await userEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
  });
});
```

- [ ] **Step 3: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- patient-detail`
Expected: FAIL.

- [ ] **Step 4: Implement `apps/web/src/components/patients/patient-detail.tsx`**

```tsx
'use client';

import { ApiError } from '@/lib/api/client';
import { usePatient } from '@/lib/queries/patients';
import { EditPatientForm } from '@/components/patients/edit-patient-form';
import { BioimpedanceSection } from '@/components/patients/bioimpedance-section';
import { CreatedBanner } from '@/components/patients/created-banner';
import { Skeleton } from '@/components/ui/skeleton';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function PatientDetail({ id, created }: { id: string; created: boolean }) {
  const query = usePatient(id);

  if (query.isLoading) {
    return <Skeleton className="h-64 w-full max-w-3xl" />;
  }

  if (query.isError || !query.data) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        {notFound ? 'Paciente não encontrado.' : 'Erro ao carregar o paciente.'}
      </div>
    );
  }

  const patient = query.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <CreatedBanner show={created} />

      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
          {initials(patient.user.name)}
        </span>
        <div>
          <p className="font-bold">{patient.user.name}</p>
          <p className="text-sm text-muted-foreground">{patient.user.email}</p>
        </div>
        <span className="ml-auto rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
          Paciente
        </span>
      </div>

      <EditPatientForm patient={patient} />

      <BioimpedanceSection />
    </div>
  );
}
```

- [ ] **Step 5: Implement `apps/web/src/app/(app)/patients/[id]/page.tsx`**

```tsx
import { PatientDetail } from '@/components/patients/patient-detail';

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  return <PatientDetail id={id} created={created === '1'} />;
}
```

- [ ] **Step 6: Run, verify pass**

Run: `pnpm --filter @nutri-plus/web test -- patient-detail`
Expected: 4 passing.

- [ ] **Step 7: Full verification**

```bash
pnpm --filter @nutri-plus/web test
pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/web build
```
Expected: all tests pass; tsc clean; build succeeds with `/patients`, `/patients/new`, `/patients/[id]` in the route table.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/patients/edit-patient-form.tsx apps/web/src/components/patients/patient-detail.tsx apps/web/src/components/patients/patient-detail.test.tsx "apps/web/src/app/(app)/patients/[id]"
git commit -m "feat(web): patient detail/edit page + post-create flow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Step 1: Full checks**

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/web test
pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/web build
```
Expected: all green; routes `/patients`, `/patients/new`, `/patients/[id]` present.

- [ ] **Step 2: Manual smoke (requires real Supabase + API + `.env.local`)**

1. `/patients` → list (or empty state) loads.
2. "Novo paciente" → fill name + email (+ optional clinical) → "Criar paciente" → lands on `/patients/[id]?created=1` with the success banner; the invite email is sent.
3. Edit a clinical field → "Salvar alterações" → toast; refresh shows the change.
4. Bioimpedância section shows "em breve"; "Prosseguir para bioimpedância" is disabled; "Deixar para depois" dismisses the banner.

---

## Notes for the implementer

- **Single quotes** everywhere; pt-BR copy.
- The form `defaultValues` use `''` for every field (controlled inputs/selects); the zod `preprocess(emptyToUndefined, …)` converts blanks to `undefined` so they're omitted from the request. The `as unknown as …Values` casts on `defaultValues` are because the schema's output type (post-coercion) differs from the all-strings input shape — this is the pragmatic rhf+zod pattern; don't fight the types elsewhere.
- The shadcn `Select` needs a non-empty item value; the unset state is `value=''` (placeholder shown) — never add a `SelectItem value=""`.
- Pages are thin: server files render the client feature components. The `[id]` page awaits `params`/`searchParams` (Next 16) and passes `created` as a prop, so no `useSearchParams`/Suspense is needed.
- `ApiError` (from `@/lib/api/client`) carries `.status`; use it for the 409 (create) and 404 (detail) branches.
