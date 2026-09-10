# Importação inteligente de pacientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ficha de paciente existe sem conta; cadastro e importação não enviam convite; o nutricionista convida depois; planilha modelo ou qualquer Excel/CSV mapeia colunas (dicionário + IA nos cabeçalhos) e grava ficha + uma avaliação + anamnese.

**Architecture:** `PatientProfile` passa a ser o agregado (name, email?, phone?, userId?, isDemo). `User` só nasce em `POST /v1/patients/:id/invite`. Importação é módulo próprio (`patients/import`): parse ExcelJS, dicionário de headers, `OpenAIProvider.generateStructured` só com cabeçalhos, preview + commit síncronos. UI web: form sem convite, botão Enviar convite no detalhe, assistente em `/patients/import`.

**Tech Stack:** NestJS + Prisma 7 + Jest (API), Next.js App Router + Vitest (web), ExcelJS, `OpenAIProvider` existente (tier `fast`), `@nutri-plus/shared-types`, `canonicalizeWhatsappNumber`.

**Spec:** `docs/superpowers/specs/2026-09-09-smart-patient-import-design.md`

## Global Constraints

- Stay on `feat/smart-patient-import`. Do not push/PR unless asked. Never commit `.env`.
- Argue from the spec. Copy pt-BR verbatim: **Enviar convite**, **Importar**, **Baixar planilha modelo**, “O paciente vai receber um e-mail para criar a senha do app.”, “O convite do app é enviado depois, na ficha, quando houver e-mail.”
- Create e import **nunca** chamam `inviteUser`. Quota de AI (`assertAiActionQuota`) **não** se aplica a `COLUMN_MAPPING`.
- IA de mapeamento recebe **só headers**, nunca células.
- API: aspas simples. Web: match the file you edit.
- After schema: `pnpm --filter @nutri-plus/api prisma:generate` then `pnpm --filter @nutri-plus/shared-types build`.
- Verify green: `pnpm --filter @nutri-plus/api test`; `pnpm --filter @nutri-plus/web test`. E2E API when a task touches HTTP: `pnpm --filter @nutri-plus/api test:e2e`.
- Do not add bulk invite, email change after invite, `.xls` binário, or meal-plan/agenda import.
- `canonicalizeWhatsappNumber` throw → `400` “Número de WhatsApp inválido.” (mesmo padrão de `nutritionist-settings.service.ts`).
- `CONTEXT.md` já define Paciente / Conta / Convite / Importação — não reabrir.

## File structure

| File | Responsibility |
|---|---|
| `packages/shared-types/src/v1/patient.ts` | `name`/`email`/`phone`/`inviteStatus` na ficha; create/update; tipos de import |
| `packages/shared-types/src/v1/appointment.ts` | `AppointmentPatientSummary` lê nome/e-mail da ficha |
| `apps/api/prisma/schema.prisma` + migration | `userId?`, `name`, `email?`, `phone?`, `isDemo`, índice parcial, `COLUMN_MAPPING` |
| `apps/api/src/patients/patients.service.ts` | create sem convite, demo sem User, mapper, PATCH, invite, deleteDemo |
| `apps/api/src/patients/dto/create-patient.dto.ts` | email/phone opcionais |
| `apps/api/src/patients/dto/update-patient.dto.ts` | name/email/phone |
| `apps/api/src/users/users.service.ts` | self-onboard preenche ficha; invite **connect** ficha existente |
| `apps/api/src/appointments/appointments.service.ts` | select name/email da ficha |
| `apps/api/src/patients/pdf/evolution-pdf.service.ts` | `patient.name` |
| `apps/api/src/ai-jobs/ai-jobs.service.ts` | `patient.name` |
| `apps/api/src/meta/meta-activation.service.ts` | `profile.name` |
| `apps/api/src/patients/import/import-fields.ts` | catálogo key/label/aliases |
| `apps/api/src/patients/import/import-parsers.ts` | valores (data, altura, enums, decimal) |
| `apps/api/src/patients/import/import-mapping.ts` | match template/alias + AI fallback |
| `apps/api/src/ai/prompts/column-mapping.prompt.ts` | prompt de headers |
| `apps/api/src/patients/import/import.service.ts` | template, preview, commit |
| `apps/api/src/patients/import/import.controller.ts` | `patients/import` |
| `apps/web/src/lib/validation/patient.ts` | email opcional, phone |
| `apps/web/src/components/patients/*` | lista, form, detalhe, convite |
| `apps/web/src/app/(app)/patients/import/page.tsx` | wizard |
| `apps/web/src/components/agenda/*` | `a.patient.name` |

---

### Task 1: shared-types — ficha é o paciente

**Files:**
- Modify: `packages/shared-types/src/v1/patient.ts`
- Modify: `packages/shared-types/src/v1/appointment.ts`
- Modify: `packages/shared-types/src/v1/index.ts` (só se criar arquivo novo; senão não)
- Test: `apps/api/src/patients/patient-types.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PatientInviteStatus = 'NOT_INVITED' | 'INVITED' | 'ACTIVE'`
  - `PatientSummary`: `id`, `name: string`, `email: string | null`, `phone: string | null`, `inviteStatus`, `user: { id: string } | null`, clínica existente, `isDemo`, timestamps. **Sem** `user.name` / `user.email`.
  - `PatientDetail extends PatientSummary` (inalterado além do pai)
  - `CreatePatientRequest`: `name: string`; `email?: string`; `phone?: string`; clínica opcional; `demo?: boolean`
  - `UpdatePatientRequest`: `Partial` de name/email/phone + clínica + toggles (sem `demo`)
  - `ImportPreviewResponse`, `ImportCommitResponse` como no spec §6
  - `AppointmentPatientSummary`: `{ id: string; name: string; email: string | null; user: { id: string } | null }`

- [ ] **Step 1: Write the failing types smoke test**

Create `apps/api/src/patients/patient-types.spec.ts`:

```ts
import type {
  CreatePatientRequest,
  ImportCommitResponse,
  ImportPreviewResponse,
  PatientInviteStatus,
  PatientSummary,
  UpdatePatientRequest,
} from '@nutri-plus/shared-types';
import type { AppointmentPatientSummary } from '@nutri-plus/shared-types';

describe('patient identity types', () => {
  it('PatientSummary carries ficha fields, not user.name', () => {
    const row: PatientSummary = {
      id: 'p1',
      name: 'Maria Silva',
      email: null,
      phone: '5511999998888',
      inviteStatus: 'NOT_INVITED' satisfies PatientInviteStatus,
      user: null,
      nutritionistId: 'n1',
      birthDate: null,
      gender: null,
      height: null,
      imc: null,
      targetWeight: null,
      objective: null,
      activityLevel: null,
      restrictions: null,
      allergies: null,
      medicalConditions: null,
      notes: null,
      canLogAssessments: false,
      showMealTargetToPatient: false,
      photoUrl: null,
      isDemo: false,
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    };
    expect(row.user).toBeNull();
    const created: CreatePatientRequest = { name: 'Maria Silva' };
    expect(created.email).toBeUndefined();
    const patch: UpdatePatientRequest = { email: 'm@x.com', phone: '11999998888' };
    expect(patch.email).toBe('m@x.com');
  });

  it('import DTOs match spec §6', () => {
    const preview: ImportPreviewResponse = {
      headers: ['Nome'],
      suggestedMapping: { Nome: 'name' },
      mappedBy: { Nome: 'template' },
      rowCount: 1,
      previewRows: [{ line: 2, values: { Nome: 'Ana' } }],
    };
    const commit: ImportCommitResponse = {
      created: 1,
      skipped: 0,
      errors: [],
    };
    expect(preview.mappedBy.Nome).toBe('template');
    expect(commit.created).toBe(1);
  });

  it('AppointmentPatientSummary reads name from the ficha', () => {
    const p: AppointmentPatientSummary = {
      id: 'p1',
      name: 'Maria',
      email: null,
      user: null,
    };
    expect(p.name).toBe('Maria');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/api test -- src/patients/patient-types.spec.ts`
Expected: FAIL — `ImportPreviewResponse` / `inviteStatus` / `CreatePatientRequest.email?` not exported.

- [ ] **Step 3: Write the types**

Replace `PatientUserSummary` usage on `PatientSummary` with the spec shape. Keep exporting a narrow `PatientUserRef = { id: string }` if useful. Add import types to `patient.ts`. Change `AppointmentPatientSummary` in `appointment.ts`. `email` on create is optional (`email?: string`).

- [ ] **Step 4: Rebuild types and pass the smoke test**

Run: `pnpm --filter @nutri-plus/shared-types build && pnpm --filter @nutri-plus/api test -- src/patients/patient-types.spec.ts`
Expected: PASS. Existing tests that construct `PatientSummary` with `user: { name, email }` will fail typecheck later — fix those in Tasks 3 and 7, not here, unless `tsc` of this spec file is the only runner. Do **not** mass-fix web in this task.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/v1/patient.ts packages/shared-types/src/v1/appointment.ts apps/api/src/patients/patient-types.spec.ts
git commit -m "feat(patients): ficha owns name, email, phone in shared-types"
```

---

### Task 2: Prisma migration — userId opcional + colunas da ficha

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`PatientProfile`, `AIInteractionType`)
- Create: `apps/api/prisma/migrations/20260910120000_patient_ficha_identity/migration.sql`

**Interfaces:**
- Consumes: Task 1 types (não usados no SQL).
- Produces: `PatientProfile.name: String`, `email String?`, `phone String?`, `isDemo Boolean @default(false)`, `userId String? @unique`, `user User?`, enum value `COLUMN_MAPPING`.

- [ ] **Step 1: Write the failing schema assertion test**

Add to `apps/api/src/patients/patient-types.spec.ts` (or a tiny `schema-identity.spec.ts` that reads generated client after generate — skip runtime DB). Prefer documenting the SQL and verifying generate.

No unit test can see SQL until generate. This task's red is: `prisma generate` fails until schema matches. Write the migration SQL first as the deliverable, then generate.

- [ ] **Step 2: Change `schema.prisma`**

On `PatientProfile`:
- `userId String? @unique`
- `user User? @relation(...)`
- `name String` (required after backfill)
- `email String?`
- `phone String?`
- `isDemo Boolean @default(false)`

Do **not** add `@@unique([email])` in Prisma (multiple NULLs + partial index). Partial unique is SQL-only.

On `enum AIInteractionType` add `COLUMN_MAPPING`.

- [ ] **Step 3: Write migration SQL**

`apps/api/prisma/migrations/20260910120000_patient_ficha_identity/migration.sql`:

```sql
-- AlterEnum
ALTER TYPE "AIInteractionType" ADD VALUE 'COLUMN_MAPPING';

-- AlterTable
ALTER TABLE "PatientProfile" ADD COLUMN "name" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- Backfill from User
UPDATE "PatientProfile" AS p
SET
  "name" = u."name",
  "email" = u."email",
  "isDemo" = (u."authProvider" = 'demo')
FROM "User" AS u
WHERE p."userId" = u."id";

ALTER TABLE "PatientProfile" ALTER COLUMN "name" SET NOT NULL;

ALTER TABLE "PatientProfile" ALTER COLUMN "userId" DROP NOT NULL;

CREATE UNIQUE INDEX "PatientProfile_email_key" ON "PatientProfile" ("email") WHERE "email" IS NOT NULL;
```

- [ ] **Step 4: Generate client**

Run: `pnpm --filter @nutri-plus/api prisma:generate`
Expected: client exposes `name`, `email`, `phone`, `isDemo`, optional `userId`, `AIInteractionType.COLUMN_MAPPING`.

Apply locally: `pnpm --filter @nutri-plus/api db:migrate` (or `prisma migrate deploy` if that's the repo habit). Existing rows must keep `userId`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260910120000_patient_ficha_identity
git commit -m "feat(patients): ficha columns and optional userId"
```

---

### Task 3: Mapper de leitura — list/get/PDF/agenda/jobs/meta/export

**Files:**
- Modify: `apps/api/src/patients/patients.service.ts` (`toPublicUser`, `toDetail`, `listPatients`, LGPD export `profile.name`)
- Modify: `apps/api/src/appointments/appointments.service.ts` (`PATIENT_SUMMARY`)
- Modify: `apps/api/src/patients/pdf/evolution-pdf.service.ts`
- Modify: `apps/api/src/ai-jobs/ai-jobs.service.ts`
- Modify: `apps/api/src/meta/meta-activation.service.ts`
- Test: existing `patients.service.spec.ts`, `appointments` unit if any, `evolution-pdf.service.spec.ts`, `ai-jobs.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 columns; Task 1 `PatientInviteStatus`.
- Produces:
  - `inviteStatusOf(userId: string | null, firstAppLoginAt: Date | null): PatientInviteStatus`
  - `toDetail` / list item: `{ name, email, phone, inviteStatus, user: { id } | null, isDemo: row.isDemo, ... }`
  - Appointment include: `{ id, name, email, user: { select: { id: true } } }`

```ts
export function inviteStatusOf(
  userId: string | null,
  firstAppLoginAt: Date | null,
): 'NOT_INVITED' | 'INVITED' | 'ACTIVE' {
  if (!userId) return 'NOT_INVITED';
  if (!firstAppLoginAt) return 'INVITED';
  return 'ACTIVE';
}
```

Put `inviteStatusOf` in `apps/api/src/patients/invite-status.ts` (pure) so tests don't boot Nest.

- [ ] **Step 1: Failing tests for inviteStatusOf + toDetail shape**

Create `apps/api/src/patients/invite-status.spec.ts`:

```ts
import { inviteStatusOf } from './invite-status';

describe('inviteStatusOf', () => {
  it('NOT_INVITED when there is no account', () => {
    expect(inviteStatusOf(null, null)).toBe('NOT_INVITED');
  });
  it('INVITED when userId is set and the patient never opened the app', () => {
    expect(inviteStatusOf('u1', null)).toBe('INVITED');
  });
  it('ACTIVE after firstAppLoginAt', () => {
    expect(inviteStatusOf('u1', new Date('2026-09-01'))).toBe('ACTIVE');
  });
});
```

In `patients.service.spec.ts` `getPatient` expectation, change the mocked row to include `name: 'Ann', email: 'a@x.com', phone: null, isDemo: false, userId: 'u1', firstAppLoginAt: null, user: { id: 'u1', authProvider: 'supabase' }` and expect:

```ts
expect(result).toEqual(expect.objectContaining({
  name: 'Ann',
  email: 'a@x.com',
  phone: null,
  inviteStatus: 'INVITED',
  user: { id: 'u1' },
  isDemo: false,
}));
```

`isDemo` MUST come from the column, not `authProvider`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @nutri-plus/api test -- src/patients/invite-status.spec.ts src/patients/patients.service.spec.ts`
Expected: FAIL — module not found / shape still uses `user.name`.

- [ ] **Step 3: Implement mapper**

`listPatients` search `where` OR on `name`, `email`, `phone` (insensitive contains) — **not** `user.name`.

`PATIENT_LIST_INCLUDE` / `PATIENT_DETAIL_INCLUDE`: `user: { select: { id: true } }` only (authProvider no longer needed).

`toDetail` / list map:
```
name: rest.name,
email: rest.email,
phone: rest.phone,
inviteStatus: inviteStatusOf(rest.userId, rest.firstAppLoginAt),
user: rest.userId ? { id: rest.userId } : null,
isDemo: rest.isDemo,
```
Do not spread a nested `user` with name/email.

PDF: `select: { height: true, name: true }` → `patientName: patient?.name ?? 'Paciente'`.

Appointments `PATIENT_SUMMARY`:
```
select: { id: true, name: true, email: true, user: { select: { id: true } } }
```

ai-jobs: `patientName: job.patient?.name ?? ''`.

meta-activation: `name: profile?.name ?? null`.

LGPD export `profile.name` / `profile.email` from `p.name` / `p.email`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @nutri-plus/api test -- src/patients src/appointments src/ai-jobs src/meta src/patients/pdf`
Expected: PASS. Fix any spec fixtures that still nest `user.name` on **patient** (employee fixtures stay).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/patients apps/api/src/appointments/appointments.service.ts apps/api/src/patients/pdf/evolution-pdf.service.ts apps/api/src/ai-jobs/ai-jobs.service.ts apps/api/src/meta/meta-activation.service.ts
git commit -m "feat(patients): read name, email, phone, inviteStatus from the ficha"
```

---

### Task 4: POST /patients cria só a ficha (demo sem User)

**Files:**
- Modify: `apps/api/src/patients/dto/create-patient.dto.ts`
- Modify: `apps/api/src/patients/dto/update-patient.dto.ts` (phone/name/email on update land in Task 5; this task only create DTO)
- Modify: `apps/api/src/patients/patients.service.ts` (`createPatient`, `deleteDemoPatient`)
- Modify: `apps/api/src/users/users.service.ts` (`createWithProfile` nested profile gets `name` + `email`)
- Test: `patients.service.spec.ts`, `users.service.spec.ts`, `test/patients.e2e-spec.ts`

**Interfaces:**
- Consumes: `CreatePatientRequest` (email optional).
- Produces: `createPatient` **does not** call `inviteUser` / `createInvitedPatient`. Demo: `prisma.patientProfile.create` with `isDemo: true`, `userId` null. `deleteDemoPatient` gates on `isDemo`, deletes User only if `userId` set.

- [ ] **Step 1: Rewrite createPatient unit tests to the new contract**

Replace the current “invites then creates” examples:

```ts
it('creates a ficha without inviting, even when email is present', async () => {
  prisma.patientProfile.create.mockResolvedValue({ id: 'pp1' } as any);
  prisma.patientProfile.findFirst.mockResolvedValue({
    id: 'pp1', name: 'Ann', email: 'a@x.com', phone: null,
    userId: null, firstAppLoginAt: null, isDemo: false,
    height: 160, assessments: [], consents: [],
  } as any);

  const result = await service.createPatient(ctx, dto);

  expect(supabaseAdmin.inviteUser).not.toHaveBeenCalled();
  expect(users.createInvitedPatient).not.toHaveBeenCalled();
  expect(prisma.patientProfile.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      name: 'Ann',
      email: 'a@x.com',
      nutritionistId: 'nutri-1',
      height: 160,
      isDemo: false,
    }),
  });
  expect(result.inviteStatus).toBe('NOT_INVITED');
  expect(result.user).toBeNull();
});

it('creates without email', async () => {
  prisma.patientProfile.create.mockResolvedValue({ id: 'pp1' } as any);
  prisma.patientProfile.findFirst.mockResolvedValue({
    id: 'pp1', name: 'Ann', email: null, phone: null,
    userId: null, firstAppLoginAt: null, isDemo: false,
    height: null, assessments: [], consents: [],
  } as any);
  await service.createPatient(ctx, { name: 'Ann' } as any);
  expect(prisma.patientProfile.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ name: 'Ann', email: null }),
  });
  expect(supabaseAdmin.inviteUser).not.toHaveBeenCalled();
});

it('does not reject example.com on create (no invite)', async () => {
  prisma.patientProfile.create.mockResolvedValue({ id: 'pp1' } as any);
  prisma.patientProfile.findFirst.mockResolvedValue({
    id: 'pp1', name: 'Ann', email: 'qa@example.com', phone: null,
    userId: null, firstAppLoginAt: null, isDemo: false,
    assessments: [], consents: [], height: null,
  } as any);
  await service.createPatient(ctx, { name: 'Ann', email: 'qa@example.com' } as any);
  expect(supabaseAdmin.inviteUser).not.toHaveBeenCalled();
});

it('demo: true creates a ficha without User', async () => {
  prisma.patientProfile.create.mockResolvedValue({ id: 'pp-demo' } as any);
  prisma.onboardingProgress.upsert.mockResolvedValue({} as any);
  prisma.patientProfile.findFirst.mockResolvedValue({
    id: 'pp-demo', name: 'Maria Demonstração', email: null, phone: null,
    userId: null, firstAppLoginAt: null, isDemo: true,
    assessments: [], consents: [], height: null,
  } as any);
  const result = await service.createPatient(ctx, { name: 'Maria Demonstração', demo: true } as any);
  expect(users.createDemoPatient).not.toHaveBeenCalled();
  expect(result.isDemo).toBe(true);
  expect(result.user).toBeNull();
});
```

Delete tests that expect rollback of invite on create.

`deleteDemoPatient`: 403 when `isDemo === false`; when `isDemo` and `userId` null, do not `user.delete`.

CreatePatientDto: `@IsOptional() @IsEmail() email?: string;` `@IsOptional() @IsString() @MaxLength(20) phone?: string;` name stays required. Min length 2 is web-side; API already `@IsString @MaxLength(200)` — add `@MinLength(2)` to match web.

- [ ] **Step 2: Run tests — they fail**

Run: `pnpm --filter @nutri-plus/api test -- src/patients/patients.service.spec.ts`
Expected: FAIL (create still invites).

- [ ] **Step 3: Implement createPatient / demo / deleteDemo**

`createPatient`:
1. Resolve nutritionistId.
2. Canonicalize `phone` if present (catch → 400).
3. `demo`: `patientProfile.create` with `isDemo: true`, toggles forced off, no User; upsert onboarding; return `getPatient`.
4. Else: load nutritionist defaults; `patientProfile.create` with name, email lowercased or null, phone, clinical, defaults. Map Prisma `P2002` on email → `ConflictException`.
5. `maybeEvaluateActivation`.
6. **Never** `UNDELIVERABLE_EMAIL` here. **Never** `inviteUser`.

`createWithProfile` (patient branch): nested `patientProfile.create` must set `name: input.name`, `email: input.email`.

- [ ] **Step 4: Fix e2e `test/patients.e2e-spec.ts`**

`POST /v1/patients` with email → 201, `body.name`, `body.email`, `body.user === null`, `body.inviteStatus === 'NOT_INVITED'`. Missing email → **201**, not 400. Fake `inviteUser` must **not** have been called (if the e2e overrides SupabaseAdmin, assert `not.toHaveBeenCalled`).

Run: `pnpm --filter @nutri-plus/api test -- src/patients src/users && pnpm --filter @nutri-plus/api test:e2e -- test/patients.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/patients apps/api/src/users/users.service.ts apps/api/src/users/users.service.spec.ts apps/api/test/patients.e2e-spec.ts
git commit -m "feat(patients): create ficha without invite or account"
```

---

### Task 5: PATCH name / email / phone

**Files:**
- Modify: `apps/api/src/patients/dto/update-patient.dto.ts`
- Modify: `apps/api/src/patients/patients.service.ts` (`updatePatient`)
- Test: `patients.service.spec.ts`

**Interfaces:**
- Consumes: `UpdatePatientRequest`.
- Produces: PATCH may set `name`, `email` (only if `userId == null`), `phone`. Name also updates `User.name` when `userId` set. Email after invite → `UnprocessableEntityException`.

- [ ] **Step 1: Failing tests**

```ts
it('updates name on the ficha and mirrors User.name when invited', async () => {
  prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1', userId: 'u1' } as any);
  prisma.patientProfile.update.mockResolvedValue({
    id: 'p1', name: 'Ana', email: 'a@x.com', phone: null, userId: 'u1',
    firstAppLoginAt: null, isDemo: false, assessments: [], consents: [], height: null,
  } as any);
  prisma.user.update.mockResolvedValue({} as any);
  await service.updatePatient(ctx, 'p1', { name: 'Ana' } as any);
  expect(prisma.patientProfile.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ name: 'Ana' }),
  }));
  expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { name: 'Ana' } });
});

it('422 when changing email after invite', async () => {
  prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1', userId: 'u1' } as any);
  await expect(service.updatePatient(ctx, 'p1', { email: 'new@x.com' } as any))
    .rejects.toBeInstanceOf(UnprocessableEntityException);
});

it('canonicalizes phone', async () => {
  prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1', userId: null } as any);
  prisma.patientProfile.update.mockResolvedValue({
    id: 'p1', name: 'Ann', email: null, phone: '5511999998888', userId: null,
    firstAppLoginAt: null, isDemo: false, assessments: [], consents: [], height: null,
  } as any);
  await service.updatePatient(ctx, 'p1', { phone: '11999998888' } as any);
  expect(prisma.patientProfile.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ phone: '5511999998888' }),
  }));
});
```

- [ ] **Step 2: Run — fail**

Run: `pnpm --filter @nutri-plus/api test -- src/patients/patients.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`UpdatePatientDto`: optional `name` (`@MinLength(2) @MaxLength(200)`), optional `email`, optional `phone`.

`updatePatient`: load owned row `{ id, userId }`. If `dto.email !== undefined && userId` → 422. Canonicalize phone. `update` data. If `dto.name && userId` → `user.update`. Return `toDetail`.

- [ ] **Step 4: Tests pass**

Run: `pnpm --filter @nutri-plus/api test -- src/patients/patients.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/patients/dto/update-patient.dto.ts apps/api/src/patients/patients.service.ts apps/api/src/patients/patients.service.spec.ts
git commit -m "feat(patients): patch name, email, phone on the ficha"
```

---

### Task 6: POST /patients/:id/invite

**Files:**
- Modify: `apps/api/src/patients/patients.controller.ts`
- Modify: `apps/api/src/patients/patients.service.ts` (`invitePatient`)
- Modify: `apps/api/src/users/users.service.ts` (`createInvitedPatient` → connect existing ficha)
- Test: `patients.service.spec.ts`, `users.service.spec.ts`, `test/patients.e2e-spec.ts`

**Interfaces:**
- Consumes: ficha with `email` and `userId == null`.
- Produces:
  - `PatientsService.invitePatient(ctx, id): Promise<PatientDetail>`
  - `UsersService.createInvitedPatient({ authProviderId, email, name, patientId })` creates `User` and `patientProfile: { connect: { id: patientId } }` — **no** nested `create`.
  - Route `POST /v1/patients/:id/invite` `@HttpCode(200)` `@Roles(NUTRITIONIST)`

- [ ] **Step 1: Failing tests**

```ts
describe('invitePatient', () => {
  it('invites then connects the User to the existing ficha', async () => {
    prisma.patientProfile.findFirst.mockResolvedValueOnce({
      id: 'pp1', email: 'a@x.com', name: 'Ann', userId: null,
    } as any);
    supabaseAdmin.inviteUser.mockResolvedValue({ id: 'sub-new' });
    users.createInvitedPatient.mockResolvedValue({} as any);
    prisma.patientProfile.findFirst.mockResolvedValueOnce({
      id: 'pp1', name: 'Ann', email: 'a@x.com', phone: null, userId: 'u-new',
      firstAppLoginAt: null, isDemo: false, assessments: [], consents: [], height: null,
    } as any);

    const result = await service.invitePatient(ctx, 'pp1');

    expect(supabaseAdmin.inviteUser).toHaveBeenCalledWith('a@x.com', { name: 'Ann' });
    expect(users.createInvitedPatient).toHaveBeenCalledWith({
      authProviderId: 'sub-new',
      email: 'a@x.com',
      name: 'Ann',
      patientId: 'pp1',
    });
    expect(result.inviteStatus).toBe('INVITED');
  });

  it('422 without email', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'pp1', email: null, userId: null } as any);
    await expect(service.invitePatient(ctx, 'pp1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(supabaseAdmin.inviteUser).not.toHaveBeenCalled();
  });

  it('422 for example.com', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({
      id: 'pp1', email: 'qa@example.com', name: 'Ann', userId: null,
    } as any);
    await expect(service.invitePatient(ctx, 'pp1')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('409 when already invited', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({
      id: 'pp1', email: 'a@x.com', userId: 'u1',
    } as any);
    await expect(service.invitePatient(ctx, 'pp1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rolls back the auth user when local write fails', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({
      id: 'pp1', email: 'a@x.com', name: 'Ann', userId: null,
    } as any);
    supabaseAdmin.inviteUser.mockResolvedValue({ id: 'sub-new' });
    users.createInvitedPatient.mockRejectedValue(new ConflictException('dup'));
    await expect(service.invitePatient(ctx, 'pp1')).rejects.toBeInstanceOf(ConflictException);
    expect(supabaseAdmin.deleteUser).toHaveBeenCalledWith('sub-new');
  });
});
```

`users.service.spec.ts`: `createInvitedPatient` now expects `patientProfile: { connect: { id: 'pp1' } }` and **no** `create: { nutritionistId, ... }`.

- [ ] **Step 2: Run — fail**

Run: `pnpm --filter @nutri-plus/api test -- src/patients/patients.service.spec.ts src/users/users.service.spec.ts`
Expected: FAIL (`invitePatient` missing).

- [ ] **Step 3: Implement**

Controller:

```ts
@Post(':id/invite')
invite(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
  return this.patients.invitePatient(ctx, id);
}
```

Declare **before** any `@Get(':id')` is fine (different method). Keep `@Post()` create as is.

`invitePatient`: `findFirst` owned; 404 if missing; 422 no email / undeliverable; 409 if `userId`; invite; `createInvitedPatient`; on throw `deleteUser`; `maybeEvaluateActivation`; return `getPatient`.

- [ ] **Step 4: e2e + unit pass**

E2E: create without email 201; PATCH email; POST invite 200 `inviteStatus: INVITED` and fake `inviteUser` called once.

Run: `pnpm --filter @nutri-plus/api test -- src/patients src/users && pnpm --filter @nutri-plus/api test:e2e -- test/patients.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/patients apps/api/src/users apps/api/test/patients.e2e-spec.ts
git commit -m "feat(patients): explicit invite creates the account"
```

---

### Task 7: Web — leitura (lista, detalhe, agenda) + busca/telefone

**Files:**
- Modify: `apps/web/src/components/patients/patients-list.tsx` (+ test)
- Modify: `apps/web/src/components/patients/patient-detail.tsx` (+ test)
- Modify: `apps/web/src/components/patients/edit-patient-form.tsx` (+ test)
- Modify: `apps/web/src/components/agenda/today-agenda-widget.tsx`, `day-panel.tsx`, `agenda-list.tsx`, `appointment-tooltip.tsx`, `appointment-dialog.tsx` (+ their tests)
- Modify: any other `patient.user.name` under `apps/web/src/components/patients` (nutrition-targets fixture)

**Interfaces:**
- Consumes: `PatientSummary.name/email/phone/inviteStatus`, `AppointmentPatientSummary.name`.
- Produces: UI reads `patient.name`. Lista mostra telefone + status. Busca placeholder “Buscar por nome, e-mail ou telefone”. WhatsApp link `https://wa.me/${phone}` when phone set (`whatsappMeUrl`).

- [ ] **Step 1: Failing UI tests**

Update fixtures:

```ts
const patient = {
  id: 'p1',
  name: 'Maria Silva',
  email: 'maria@x.com',
  phone: '5511999998888',
  inviteStatus: 'NOT_INVITED',
  user: null,
  objective: 'WEIGHT_LOSS',
  activityLevel: 'MODERATE',
  imc: 24.2,
  createdAt: '2026-05-12T00:00:00.000Z',
  photoUrl: null,
  isDemo: false,
};
```

Add test: lista mostra “Sem convite” (or the spec labels: **sem convite** / **convite enviado** / **ativo**) and a WhatsApp link. Agenda tooltip uses `appointment.patient.name`.

Labels — add to `apps/web/src/lib/patients/labels.ts`:

```ts
export const INVITE_STATUS_LABELS: Record<PatientInviteStatus, string> = {
  NOT_INVITED: 'Sem convite',
  INVITED: 'Convite enviado',
  ACTIVE: 'Ativo',
};
```

- [ ] **Step 2: Run web tests — fail on `user.name`**

Run: `pnpm --filter @nutri-plus/web test -- src/components/patients/patients-list.test.tsx src/components/patients/patient-detail.test.tsx src/components/agenda`
Expected: FAIL or runtime `Cannot read name of undefined`.

- [ ] **Step 3: Switch call sites to `patient.name` / `patient.email`**

Lista: botão **Importar** `Link href="/patients/import"` next to **+ Novo paciente** (page can 404 until Task 12 — that's OK if the test only checks the href). Do not build the wizard yet.

- [ ] **Step 4: Tests pass**

Run: `pnpm --filter @nutri-plus/web test -- src/components/patients src/components/agenda`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/patients apps/web/src/components/agenda apps/web/src/lib/patients/labels.ts
git commit -m "feat(web): show ficha name, phone, invite status"
```

---

### Task 8: Web — cadastro sem convite + Enviar convite no detalhe

**Files:**
- Modify: `apps/web/src/lib/validation/patient.ts` (+ `patient.test.ts`)
- Modify: `apps/web/src/components/patients/create-patient-form.tsx` (+ test)
- Modify: `apps/web/src/components/patients/edit-patient-form.tsx` (+ test)
- Modify: `apps/web/src/components/patients/patient-detail.tsx` (+ test)
- Modify: `apps/web/src/lib/api/patients.ts`
- Modify: `apps/web/src/lib/queries/patients.ts`

**Interfaces:**
- Consumes: `invitePatient` API, optional email on create.
- Produces:
  - `invitePatient(id: string): Promise<PatientDetail>` → `POST /patients/${id}/invite`
  - `useInvitePatient(id)` mutation invalidates `['patient', id]` and `['patients']`
  - create schema: `email` optional (empty → undefined); `phone` optional with same WhatsApp refine as settings
  - Copy under email: `O convite do app é enviado depois, na ficha, quando houver e-mail.`
  - Labels: E-mail (no asterisk). Telefone field.
  - Demo fixture: name only, no `example.com` required
  - Detail: button **Enviar convite** enabled iff `canEdit && inviteStatus === 'NOT_INVITED' && email`; disabled with dica if no email; hidden if INVITED/ACTIVE. Confirm dialog text exact from spec.

- [ ] **Step 1: Failing tests**

`createPatientSchema.safeParse({ name: 'Maria Silva' }).success === true`

`create-patient-form.test.tsx`: submit with only name calls `mutateAsync` with `{ name: 'Maria Silva', ... }` and **no** required-email error. Helper text matches spec. Email label is not `E-mail *`.

`patient-detail.test.tsx`:
- NOT_INVITED + email → button Enviar convite
- NOT_INVITED + email null → button disabled
- INVITED → no button

- [ ] **Step 2: Run — fail**

Run: `pnpm --filter @nutri-plus/web test -- src/lib/validation/patient.test.ts src/components/patients/create-patient-form.test.tsx src/components/patients/patient-detail.test.tsx`
Expected: FAIL (email still required; no invite button).

- [ ] **Step 3: Implement form, validation, API, button**

Use `window.confirm` or the existing shadcn `AlertDialog` if the detalhe already uses one — prefer AlertDialog if present in the file tree (`components/ui/alert-dialog`). If adding the shadcn file is heavy, `window.confirm` with the exact sentence is acceptable.

Edit form: name + phone + email (email input disabled when `inviteStatus !== 'NOT_INVITED'`).

- [ ] **Step 4: Tests pass**

Run: `pnpm --filter @nutri-plus/web test -- src/lib/validation/patient.test.ts src/components/patients`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/validation/patient.ts apps/web/src/lib/validation/patient.test.ts apps/web/src/lib/api/patients.ts apps/web/src/lib/queries/patients.ts apps/web/src/components/patients
git commit -m "feat(web): optional email on create and explicit invite"
```

---

### Task 9: Import — catálogo e parsers (puro)

**Files:**
- Create: `apps/api/src/patients/import/import-fields.ts`
- Create: `apps/api/src/patients/import/import-parsers.ts`
- Test: `apps/api/src/patients/import/import-fields.spec.ts`
- Test: `apps/api/src/patients/import/import-parsers.spec.ts`

**Interfaces:**
- Consumes: spec §4 catalog; `Gender` / `PatientObjective` / `ActivityLevel` from Prisma client or shared-types.
- Produces:

```ts
export type ImportFieldKey = string; // 'name' | 'email' | ... | 'assessment.weight' | 'anamnese.mainComplaint' | 'ignore'

export interface ImportField {
  key: ImportFieldKey;
  label: string;
  aliases: string[];
}

export const IMPORT_FIELDS: ImportField[]; // every row in spec §4
export function normalizeHeader(raw: string): string; // trim, NFD, strip combining marks, lower case
export function fieldByNormalizedHeader(header: string): ImportField | undefined; // label or alias exact after normalize

export function parseDecimal(raw: string): number | null;
export function parseHeightCm(raw: string): number | null; // <=3 → meters*100
export function parseDateCell(raw: string | number): Date | null; // DD/MM/YYYY, YYYY-MM-DD, excel serial
export function parseGender(raw: string): Gender | null;
export function parseObjective(raw: string): PatientObjective | null;
export function parseActivityLevel(raw: string): ActivityLevel | null;
export function parseEmail(raw: string): string | null; // trim lower; null if empty; throw invalid
export function parsePhoneCell(raw: string): string | null; // canonicalize; throw invalid
```

Excel serial: `excelJsDate = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)` (Excel's 1900 system). Only if `typeof raw === 'number'`.

- [ ] **Step 1: Failing parser tests**

```ts
it('maps Nome completo via alias', () => {
  expect(fieldByNormalizedHeader('Nome completo')?.key).toBe('name');
});
it('maps E-mail despite accent/case', () => {
  expect(fieldByNormalizedHeader('E-MAIL')?.key).toBe('email');
});
it('unknown header is undefined', () => {
  expect(fieldByNormalizedHeader('CPF')).toBeUndefined();
});

it('height 1,65 → 165', () => {
  expect(parseHeightCm('1,65')).toBe(165);
});
it('height 165 stays cm', () => {
  expect(parseHeightCm('165')).toBe(165);
});
it('parses BR date', () => {
  expect(parseDateCell('12/03/1990')?.toISOString().slice(0, 10)).toBe('1990-03-12');
});
it('rejects future date', () => {
  expect(parseDateCell('12/03/2999')).toBeNull();
});
it('parses F/Feminino', () => {
  expect(parseGender('F')).toBe('FEMALE');
  expect(parseGender('Feminino')).toBe('FEMALE');
});
it('parses emagrecer → WEIGHT_LOSS', () => {
  expect(parseObjective('emagrecer')).toBe('WEIGHT_LOSS');
});
```

Include one test per assessment/anamnese **label** that `fieldByNormalizedHeader(label)?.key === key` (loop over `IMPORT_FIELDS`).

- [ ] **Step 2: Run — fail**

Run: `pnpm --filter @nutri-plus/api test -- src/patients/import/import-fields.spec.ts src/patients/import/import-parsers.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement catalog + parsers**

Copy labels/aliases from spec §4. Extra aliases listed there (Peso, Weight, %GC, CC, CQ) on the matching keys.

`parseEmail`: empty → null; if present and no `@` → throw `Error('invalid-email')`.

- [ ] **Step 4: Tests pass**

Run: `pnpm --filter @nutri-plus/api test -- src/patients/import`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/patients/import
git commit -m "feat(patients): import field catalog and value parsers"
```

---

### Task 10: Mapping dictionary + IA de headers

**Files:**
- Create: `apps/api/src/ai/prompts/column-mapping.prompt.ts`
- Create: `apps/api/src/patients/import/import-mapping.ts`
- Test: `apps/api/src/ai/prompts/column-mapping.prompt.spec.ts`
- Test: `apps/api/src/patients/import/import-mapping.spec.ts`

**Interfaces:**
- Consumes: `IMPORT_FIELDS`, `normalizeHeader`, `fieldByNormalizedHeader`, `OpenAIProvider.generateStructured`.
- Produces:

```ts
export type MappedBy = 'template' | 'alias' | 'ai' | 'unmapped';

export function mapHeadersDeterministic(headers: string[]): {
  suggestedMapping: Record<string, string>;
  mappedBy: Record<string, MappedBy>;
  unmatched: string[];
};

export const COLUMN_MAPPING_SCHEMA = z.object({
  mappings: z.array(z.object({
    header: z.string(),
    field: z.string().nullable(),
  })),
});

export function buildColumnMappingUserPrompt(unmatched: string[]): string; // JSON.stringify({ unmatched, catalog: IMPORT_FIELDS.map(...) })

export async function mapHeadersWithAi(
  headers: string[],
  ai: { generateStructured: OpenAIProvider['generateStructured'] },
  nutritionistId: string,
): Promise<{ suggestedMapping: Record<string, string>; mappedBy: Record<string, MappedBy> }>;
```

`mapHeadersWithAi`: start from deterministic; for `unmatched`, call generateStructured `{ tier: 'fast', type: AIInteractionType.COLUMN_MAPPING, schemaName: 'column_mapping', nutritionistId, schema: COLUMN_MAPPING_SCHEMA, system: COLUMN_MAPPING_SYSTEM_PROMPT, user: buildColumnMappingUserPrompt(unmatched) }`. Merge only if `field` is a known key. On throw, return deterministic result unchanged.

Duplicate non-ignore keys after merge: leave both mapped — **commit** (Task 11) rejects. Deterministic: if two headers hit same key, first keeps it, later becomes `ignore` + `unmapped`? Spec says commit 400 if mapping has duplicates. Deterministic should still assign both if both match (e.g. "Nome" and "Nome completo") — then UI/commit 400. Simpler: first wins, second `ignore`/`unmapped`. Spec: “Dois headers no mesmo field → 400 no commit”. So deterministic **may** produce duplicates; `assertMappingUnique(mapping)` throws a `BadRequestException` used by commit.

```ts
export function assertMappingUnique(mapping: Record<string, string>): void;
```

- [ ] **Step 1: Failing tests**

```ts
it('maps template labels without AI', () => {
  const { suggestedMapping, mappedBy, unmatched } = mapHeadersDeterministic(['Nome', 'E-mail', 'CPF']);
  expect(suggestedMapping['Nome']).toBe('name');
  expect(mappedBy['Nome']).toBe('template');
  expect(suggestedMapping['CPF']).toBe('ignore');
  expect(mappedBy['CPF']).toBe('unmapped');
  expect(unmatched).toEqual(['CPF']);
});

it('uses alias before leaving unmatched', () => {
  const { suggestedMapping, mappedBy } = mapHeadersDeterministic(['Nome completo']);
  expect(suggestedMapping['Nome completo']).toBe('name');
  expect(mappedBy['Nome completo']).toBe('alias');
});

it('calls AI only with unmatched headers and never cell values', async () => {
  const generateStructured = jest.fn().mockResolvedValue({
    mappings: [{ header: 'Fone do paciente', field: 'phone' }],
  });
  const result = await mapHeadersWithAi(['Nome', 'Fone do paciente'], { generateStructured } as any, 'nut-1');
  expect(generateStructured).toHaveBeenCalledTimes(1);
  const arg = generateStructured.mock.calls[0][0];
  expect(arg.user).not.toMatch(/Maria|1199/);
  expect(arg.user).toContain('Fone do paciente');
  expect(arg.user).not.toContain('"Nome"'); // already matched, not sent
  expect(result.suggestedMapping['Fone do paciente']).toBe('phone');
  expect(result.mappedBy['Fone do paciente']).toBe('ai');
});

it('falls back to dictionary when AI throws', async () => {
  const generateStructured = jest.fn().mockRejectedValue(new Error('down'));
  const result = await mapHeadersWithAi(['Nome', 'CPF'], { generateStructured } as any, 'nut-1');
  expect(result.suggestedMapping['Nome']).toBe('name');
  expect(result.suggestedMapping['CPF']).toBe('ignore');
});

it('assertMappingUnique 400 on two columns for name', () => {
  expect(() => assertMappingUnique({ Nome: 'name', Paciente: 'name' })).toThrow();
});
```

Prompt spec: `buildColumnMappingUserPrompt(['Fone'])` is valid JSON and contains `unmatched` and catalog keys, no fabricated rows.

- [ ] **Step 2: Run — fail**

Run: `pnpm --filter @nutri-plus/api test -- src/patients/import/import-mapping.spec.ts src/ai/prompts/column-mapping.prompt.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement mapping + prompt**

System prompt (pt-BR): map each unmatched header to a catalog key or null; never invent keys; never ask for cell values.

`assertMappingUnique`: ignore keys equal to `'ignore'`; if a key appears twice, `throw new BadRequestException('campo X mapeado duas vezes')` with the field key.

- [ ] **Step 4: Tests pass**

Run: `pnpm --filter @nutri-plus/api test -- src/patients/import src/ai/prompts/column-mapping.prompt.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/patients/import/import-mapping.ts apps/api/src/patients/import/import-mapping.spec.ts apps/api/src/ai/prompts/column-mapping.prompt.ts apps/api/src/ai/prompts/column-mapping.prompt.spec.ts
git commit -m "feat(patients): column mapping dictionary and header AI"
```

---

### Task 11: Import API — template, preview, commit

**Files:**
- Create: `apps/api/src/patients/import/import.service.ts` (+ spec)
- Create: `apps/api/src/patients/import/import.controller.ts`
- Create: `apps/api/src/patients/import/import.module.ts`
- Modify: `apps/api/src/patients/patients.module.ts` (import `ImportModule` **or** register controller — prefer `ImportModule` imported by `PatientsModule` / `AppModule`)
- Modify: `apps/api/package.json` — dependency `exceljs`
- Modify: `apps/api/src/app.module.ts` if the module is top-level
- Test: `apps/api/src/patients/import/import.service.spec.ts`
- Test: `apps/api/test/patients-import.e2e-spec.ts`

**Interfaces:**
- Consumes: mapping helpers, parsers, `PatientsService` **not** required — write Prisma directly scoped to `nutritionistId`. `OpenAIProvider`. `MetaActivationService.maybeEvaluateActivation` — call the same private hook as create: inject `MetaActivationService` and duplicate the `fromBrowser` guard **or** export a small helper. Simplest: inject `PatientsService` is wrong (circular). Copy the 4-line `if (meta?.fromBrowser) return; evaluateInBackground` into `ImportService` using `MetaActivationService` (already the pattern).
- Produces:
  - `GET /v1/patients/import/template` → xlsx StreamableFile
  - `POST /v1/patients/import/preview` multipart `file`
  - `POST /v1/patients/import` multipart `file` + field `mapping` (JSON string)
  - Limits: 5 MB, 500 data rows, `.xlsx`/`.csv`, first sheet, row 1 header
  - Per-row transaction: profile → optional assessment → optional anamnese
  - Duplicate mapping → 400 whole request
  - `created == 0` still 200

ExcelJS: `pnpm --filter @nutri-plus/api add exceljs`.

Parse CSV: if file originalname/mimetype csv, split lines; delimiter `,` unless header line has `;` and not `,`.

Row line numbers are 1-based including header (first data row = 2).

Apply mapping: for each key, take cell text, run the parser for that key. `name` empty → skip error `Nome obrigatório`. Assessment keys present → `bodyAssessment.create` with `assessmentDate` default `new Date()` (date only). Any anamnese key → `patientAnamnese.create`.

- [ ] **Step 1: Failing service tests with in-memory rows (no real xlsx required for mapping/commit)**

Structure `ImportService` so `commitRows(nutritionistId, rows, mapping, meta)` is testable:

```ts
it('creates ficha + weight assessment + anamnese complaint', async () => {
  prisma.patientProfile.create.mockResolvedValue({ id: 'pp1' } as any);
  prisma.bodyAssessment.create.mockResolvedValue({} as any);
  prisma.patientAnamnese.create.mockResolvedValue({} as any);
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));

  const result = await service.commitRows('nut-1', [
    { line: 2, values: { Nome: 'Ana', 'Peso (kg)': '70', 'Queixa principal': 'cansaço' } },
  ], { Nome: 'name', 'Peso (kg)': 'assessment.weight', 'Queixa principal': 'anamnese.mainComplaint' });

  expect(result.created).toBe(1);
  expect(prisma.patientProfile.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ name: 'Ana', nutritionistId: 'nut-1', isDemo: false }),
  });
  expect(prisma.bodyAssessment.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ patientId: 'pp1', weight: 70 }),
  });
  expect(prisma.patientAnamnese.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ patientId: 'pp1', mainComplaint: 'cansaço' }),
  });
});

it('skips a row without name and continues', async () => {
  prisma.patientProfile.create.mockResolvedValue({ id: 'pp2' } as any);
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  const result = await service.commitRows('nut-1', [
    { line: 2, values: { Nome: '' } },
    { line: 3, values: { Nome: 'Bia' } },
  ], { Nome: 'name' });
  expect(result.created).toBe(1);
  expect(result.skipped).toBe(1);
  expect(result.errors[0]).toEqual(expect.objectContaining({ line: 2, message: 'Nome obrigatório' }));
});

it('skips duplicate email in the same lote without a second create', async () => {
  prisma.patientProfile.create.mockResolvedValue({ id: 'pp1' } as any);
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  const result = await service.commitRows('nut-1', [
    { line: 2, values: { Nome: 'Ana', 'E-mail': 'a@x.com' } },
    { line: 3, values: { Nome: 'Ana 2', 'E-mail': 'a@x.com' } },
  ], { Nome: 'name', 'E-mail': 'email' });
  expect(result.created).toBe(1);
  expect(result.skipped).toBe(1);
  expect(prisma.patientProfile.create).toHaveBeenCalledTimes(1);
  expect(result.errors[0].line).toBe(3);
});
```

Preview: `previewHeaders(['Nome', 'CPF'])` does not call AI if you inject a stub; unknown → ignore.

Also test: `generateStructured` throw → preview still 200.

- [ ] **Step 2: Run — fail**

Run: `pnpm --filter @nutri-plus/api test -- src/patients/import/import.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement service + controller + module**

Controller path `{ path: 'patients/import', version: '1' }` `@Roles(NUTRITIONIST)`.

Template: ExcelJS workbook, sheet `Pacientes` header = `IMPORT_FIELDS.map(f => f.label)` in catalog order; sheet `Instruções` with four short lines from spec §6. `filename="inutri-pacientes.xlsx"`.

`FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } })`.

Commit: parse `mapping` JSON from the multipart field; `assertMappingUnique`; parse file; `commitRows`; one `maybeEvaluateActivation` after the loop.

P2002 email → skip that line `Já existe um paciente com este e-mail.` Seen-set of emails in the lote too.

Invalid phone/email/height/enum/assessment bound → skip that line with a short pt-BR message. Reuse `CreateAssessmentDto` bounds: weight `IsPositive` `@Max(500)` so 0 and 501 skip.

- [ ] **Step 4: e2e with a fixture buffer**

In `test/patients-import.e2e-spec.ts`, build an xlsx via ExcelJS in the test (3 rows: two valid names, one empty name). Auth as nutritionist. Preview 200 mapping Nome→name. Commit `created: 2, skipped: 1`. Assert `inviteUser` not called. GET list contains both names. Employee token 403.

Override `OpenAIProvider` with `{ generateStructured: jest.fn().mockRejectedValue(new Error('no')) }` so tests don't need a key.

Run: `pnpm --filter @nutri-plus/api test -- src/patients/import && pnpm --filter @nutri-plus/api test:e2e -- test/patients-import.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/src/patients/import apps/api/src/patients/patients.module.ts apps/api/src/app.module.ts apps/api/test/patients-import.e2e-spec.ts pnpm-lock.yaml
git commit -m "feat(patients): import preview, commit, and template"
```

---

### Task 12: Web — assistente `/patients/import`

**Files:**
- Create: `apps/web/src/lib/api/patient-import.ts`
- Create: `apps/web/src/lib/queries/patient-import.ts`
- Create: `apps/web/src/components/patients/patient-import-wizard.tsx`
- Create: `apps/web/src/components/patients/patient-import-wizard.test.tsx`
- Create: `apps/web/src/app/(app)/patients/import/page.tsx`
- Modify: `apps/web/src/lib/api/client.ts` / `browser.ts` only if upload already covers arbitrary POST FormData (it does via `browserApiUpload`)

**Interfaces:**
- Consumes: Task 11 endpoints; `ImportPreviewResponse` / `ImportCommitResponse`; `IMPORT` field list for the select — **duplicate the keys/labels in web** from shared-types.

Add to shared-types in this task if not already in Task 1:

```ts
export const IMPORT_FIELD_OPTIONS: { key: string; label: string }[];
```

Better: export `IMPORT_FIELD_OPTIONS` from shared-types now (keys+labels only, no aliases) so the select is not copy-pasted. If Task 1 didn't add it, add it here + rebuild.

Produces wizard steps: upload → mapping table → confirm → result. No “convidar agora”. Download modelo via `browserApiDownload('/patients/import/template')` — today `apiDownload` forces `Accept: application/pdf`. **Fix:** `apiDownload(path, { token, accept?: string })` default pdf to not break evolution PDF; import passes `accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'`.

- [ ] **Step 1: Failing wizard tests**

```tsx
it('shows mapping dropdowns from preview and has no convite checkbox', async () => {
  preview.mockResolvedValue({
    headers: ['Nome', 'CPF'],
    suggestedMapping: { Nome: 'name', CPF: 'ignore' },
    mappedBy: { Nome: 'template', CPF: 'unmapped' },
    rowCount: 2,
    previewRows: [{ line: 2, values: { Nome: 'Ana', CPF: '1' } }],
  });
  render(<PatientImportWizard />);
  const file = new File(['x'], 'a.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await userEvent.upload(screen.getByLabelText(/planilha/i), file);
  expect(await screen.findByDisplayValue('Nome')).toBeTruthy(); // or getByRole select
  expect(screen.queryByText(/convidar/i)).not.toBeInTheDocument();
});

it('commits with the edited mapping and shows created count', async () => {
  commit.mockResolvedValue({ created: 2, skipped: 1, errors: [{ line: 3, name: null, message: 'Nome obrigatório' }] });
  // … upload, click Importar 2 pacientes
  expect(await screen.findByText(/2 pacientes/i)).toBeInTheDocument();
  expect(screen.getByText(/Nome obrigatório/)).toBeInTheDocument();
});
```

Page: `canManagePatients` else `<Unauthorized />` (copy `patients/new/page.tsx`).

- [ ] **Step 2: Run — fail**

Run: `pnpm --filter @nutri-plus/web test -- src/components/patients/patient-import-wizard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement wizard + API client**

`previewPatientImport(file: File)` FormData `file`.
`commitPatientImport(file: File, mapping: Record<string, string>)` FormData `file` + `mapping` JSON string.

Select options: `ignore` label **Ignorar** + every catalog label. Show a muted hint for `mappedBy` (Modelo / Alias / IA / —).

Primary button: `Importar ${rowCount} pacientes` (use `rowCount` from preview, not mapped rows).

On success, `invalidateQueries(['patients'])`. Link voltar `/patients`.

Lista already has Importar href from Task 7; add **Baixar planilha modelo** on the wizard header.

- [ ] **Step 4: Tests pass + tsc**

Run: `pnpm --filter @nutri-plus/web test -- src/components/patients src/lib/validation/patient.test.ts`
Run: `pnpm --filter @nutri-plus/shared-types build && pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/web test`
Expected: PASS. Fix remaining `patient.user.name` fixtures (nutrition-targets-section.test, etc.).

- [ ] **Step 5: Commit**

```bash
git add apps/web packages/shared-types/src/v1/patient.ts
git commit -m "feat(web): smart patient import wizard"
```

---

## Self-review (spec coverage)

| Spec section | Task |
|---|---|
| Ficha owns name/email/phone, userId optional, isDemo column | 1–2 |
| Migration backfill | 2 |
| inviteStatus derived | 3 |
| Demo without User + deleteDemo | 4 |
| Self-onboard writes name/email on ficha | 4 |
| Create never invites; example.com allowed on create | 4 |
| PATCH name/email/phone; email locked after invite | 5 |
| POST invite + connect User; undeliverable/409/rollback | 6 |
| Web list/detail/agenda | 7 |
| Form optional email + Enviar convite | 8 |
| Catalog + parsers + height/date/enums | 9 |
| Dictionary + AI headers only + AI fail-open | 10 |
| Template, preview, commit, 500/5MB, no invite, per-row tx | 11 |
| Wizard UI, no convite checkbox | 12 |
| LGPD: no cell values to OpenAI | 10–11 |
| COLUMN_MAPPING not billed as AI quota | 10 (`generateStructured` only; no entitlements) |
| Employee cannot import/invite/create | 6, 11 (`@Roles(NUTRITIONIST)`), web `canManagePatients` |
| Out of scope left out | — |
