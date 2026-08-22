# Web Product Tours (Primeiros passos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nutritionists get a `/primeiros-passos` hub and a click-through Pacientes tour (chapters, fake-data fill, demo patient without invite email); employees see the hub but cannot start Pacientes; replay never overwrites progress.

**Architecture:** Spotlight via `driver.js`; catalog/session/fixtures owned by the web app. Progress is per-user in `OnboardingProgress`. Demo patients use `authProvider: 'demo'` (no Supabase invite). Plan/quota gating stays on existing `entitlements`. Billing `OnboardingGate` is untouched.

**Tech Stack:** NestJS + Prisma 7 (API), Next.js App Router + Vitest + react-hook-form (web), `driver.js` (spotlight only), `@nutri-plus/shared-types`.

**Spec:** `docs/superpowers/specs/2026-08-21-web-product-tours-design.md`

## Global Constraints

- Stay on `feat/web-onboarding-tours`. Do not push/PR unless asked. Never commit `.env`.
- Additive Prisma migration (`pnpm --filter @nutri-plus/api db:migrate`).
- API new files: single quotes. Web: match the file you edit.
- API tests: Jest. Web tests: Vitest. shared-types has no runner — exercise new types from API/web tests.
- pt-BR copy verbatim from the spec (hub labels, tooltips, modal, lock text, demo badge **Demo**).
- Replay sessions must not call PATCH. `COMPLETED`/`SKIPPED` never recede.
- Do not change `OnboardingGate`, `canManagePatients`, or add Agenda/Pro tours.
- `driver.js` is the only new npm dependency (web). Import CSS from `driver.js/dist/driver.css`.
- Demo emails use `demo.{userIdPrefix}.{n}@example.com` so `IsEmail` accepts them; `UNDELIVERABLE_EMAIL` is skipped only when `demo: true`.
- There is **no** general nutritionist delete-patient API. `DELETE /v1/patients/:id` in this plan is **demo-only** (`authProvider === 'demo'` → 403 otherwise).
- Verify: `pnpm --filter @nutri-plus/shared-types build`; `pnpm --filter @nutri-plus/api test`; `pnpm --filter @nutri-plus/web test`. Keep existing suites green.
- After schema change: `pnpm --filter @nutri-plus/api prisma:generate`.

## File structure

| File | Responsibility |
|---|---|
| `packages/shared-types/src/v1/onboarding.ts` | Progress/patch/view types; `ONBOARDING_TOUR_IDS` |
| `packages/shared-types/src/v1/patient.ts` | `isDemo`; `CreatePatientRequest.demo?` |
| `apps/api/prisma/schema.prisma` + migration | User prompt timestamp + progress tables |
| `apps/api/src/auth/auth.constants.ts` | `DEMO_PROVIDER = 'demo'` |
| `apps/api/src/users/users.service.ts` | `createDemoPatient` |
| `apps/api/src/patients/dto/create-patient.dto.ts` | `demo?: boolean` |
| `apps/api/src/patients/patients.service.ts` | Demo create, `isDemo` mapper, demo-only delete |
| `apps/api/src/onboarding/**` | GET/PATCH progresso + dismiss prompt |
| `apps/web/src/lib/api/onboarding.ts` + `lib/queries/onboarding.ts` | Client |
| `apps/web/src/lib/onboarding/catalog.ts` | Tours/chapters/steps |
| `apps/web/src/lib/onboarding/progress.ts` | Merge catalog + server + entitlements |
| `apps/web/src/lib/onboarding/fixtures.ts` | Registry `registerFixture` / `runFixture` |
| `apps/web/src/lib/onboarding/session.ts` | URL parse (`tour`, `chapter`, `replay`) |
| `apps/web/src/components/onboarding/tour-provider.tsx` | Session + driver.js + click/next |
| `apps/web/src/components/onboarding/tour-tooltip.tsx` | iNutri popover |
| `apps/web/src/components/onboarding/hub-view.tsx` | Hub UI |
| `apps/web/src/components/onboarding/first-run-dialog.tsx` | 1st-access modal |
| `apps/web/src/components/onboarding/delete-demo-banner.tsx` | Apagar paciente-demo |
| `apps/web/src/app/(app)/primeiros-passos/page.tsx` | Route |
| `apps/web/src/components/app/nav-items.ts` | Sidebar item |
| Existing patient UI | `data-tour` + fixture registration |

---

### Task 1: shared-types — onboarding + `isDemo`

**Files:**
- Create: `packages/shared-types/src/v1/onboarding.ts`
- Modify: `packages/shared-types/src/v1/patient.ts`
- Modify: `packages/shared-types/src/v1/index.ts`
- Test: `apps/api/src/onboarding/onboarding.types.spec.ts` (Jest; types-only smoke)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ONBOARDING_TOUR_IDS = ['patients'] as const`
  - `OnboardingTourId = (typeof ONBOARDING_TOUR_IDS)[number]`
  - `OnboardingTourStatus = 'IN_PROGRESS' | 'COMPLETED'`
  - `OnboardingChapterStatus = 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'`
  - `OnboardingChapterProgressView`, `OnboardingTourProgressView`, `OnboardingMeView`
  - `PatchOnboardingPromptRequest { promptDismissed: true }`
  - `PatchOnboardingTourRequest { chapterId?: string; chapterStatus?: OnboardingChapterStatus; furthestStepId?: string; demoPatientId?: string | null; tourStatus?: 'COMPLETED' }`
  - `PatientSummary.isDemo: boolean`
  - `CreatePatientRequest.demo?: boolean`

- [ ] **Step 1: Write the failing types smoke test**

Create `apps/api/src/onboarding/onboarding.types.spec.ts`:

```ts
import {
  ONBOARDING_TOUR_IDS,
  type CreatePatientRequest,
  type OnboardingMeView,
  type PatientSummary,
} from '@nutri-plus/shared-types';

describe('onboarding shared-types', () => {
  it('exposes only the patients tour in cycle 1', () => {
    expect(ONBOARDING_TOUR_IDS).toEqual(['patients']);
  });

  it('shapes Me view and demo flag', () => {
    const view: OnboardingMeView = {
      promptDismissedAt: null,
      tours: [
        {
          tourId: 'patients',
          status: 'IN_PROGRESS',
          demoPatientId: 'p1',
          completedAt: null,
          chapters: [
            {
              chapterId: 'cadastro',
              status: 'COMPLETED',
              furthestStepId: 'save',
              completedAt: '2026-08-21T00:00:00.000Z',
            },
          ],
        },
      ],
    };
    expect(view.tours[0].tourId).toBe('patients');
    const req: CreatePatientRequest = { name: 'Maria Demonstração', email: 'demo.u1.1@example.com', demo: true };
    expect(req.demo).toBe(true);
    const summary = { isDemo: true } as PatientSummary;
    expect(summary.isDemo).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/api test onboarding.types`
Expected: FAIL (module has no `ONBOARDING_TOUR_IDS` / types).

- [ ] **Step 3: Write types**

`packages/shared-types/src/v1/onboarding.ts`:

```ts
export const ONBOARDING_TOUR_IDS = ['patients'] as const;
export type OnboardingTourId = (typeof ONBOARDING_TOUR_IDS)[number];

export type OnboardingTourStatus = 'IN_PROGRESS' | 'COMPLETED';
export type OnboardingChapterStatus = 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export interface OnboardingChapterProgressView {
  chapterId: string;
  status: OnboardingChapterStatus;
  furthestStepId: string | null;
  completedAt: string | null;
}

export interface OnboardingTourProgressView {
  tourId: string;
  status: OnboardingTourStatus;
  demoPatientId: string | null;
  completedAt: string | null;
  chapters: OnboardingChapterProgressView[];
}

export interface OnboardingMeView {
  promptDismissedAt: string | null;
  tours: OnboardingTourProgressView[];
}

export interface PatchOnboardingPromptRequest {
  promptDismissed: true;
}

export interface PatchOnboardingTourRequest {
  chapterId?: string;
  chapterStatus?: OnboardingChapterStatus;
  furthestStepId?: string;
  demoPatientId?: string | null;
  tourStatus?: 'COMPLETED';
}

export function isOnboardingTourId(value: string): value is OnboardingTourId {
  return (ONBOARDING_TOUR_IDS as readonly string[]).includes(value);
}
```

In `patient.ts`: add `isDemo: boolean` to `PatientSummary`. Add `demo?: boolean` to `CreatePatientRequest`.

In `index.ts`: `export * from './onboarding';`

- [ ] **Step 4: Build types and re-run the test**

Run: `pnpm --filter @nutri-plus/shared-types build && pnpm --filter @nutri-plus/api test onboarding.types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/v1/onboarding.ts packages/shared-types/src/v1/patient.ts packages/shared-types/src/v1/index.ts apps/api/src/onboarding/onboarding.types.spec.ts
git commit -m "feat(types): onboarding progress contracts and patient isDemo"
```

---

### Task 2: Prisma — prompt timestamp + progress tables

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`User`, `PatientProfile`, new models/enums)
- Create: migration via `pnpm --filter @nutri-plus/api db:migrate --name onboarding_progress`

**Interfaces:**
- Consumes: Task 1 type names (`IN_PROGRESS`, `COMPLETED`, `SKIPPED`).
- Produces: Prisma models `OnboardingProgress`, `OnboardingChapterProgress`; `User.onboardingPromptDismissedAt`; `PatientProfile.onboardingDemoFor`.

- [ ] **Step 1: Add schema (no test — migration is the deliverable)**

On `User`, after `feedback`:

```prisma
onboardingPromptDismissedAt DateTime?
onboardingProgress          OnboardingProgress[]
```

On `PatientProfile` relations:

```prisma
onboardingDemoFor OnboardingProgress[]
```

At the bottom of the schema (near other enums/models):

```prisma
enum OnboardingTourStatus {
  IN_PROGRESS
  COMPLETED
}

enum OnboardingChapterStatus {
  IN_PROGRESS
  COMPLETED
  SKIPPED
}

model OnboardingProgress {
  id            String               @id @default(uuid())
  userId        String
  user          User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  tourId        String
  status        OnboardingTourStatus @default(IN_PROGRESS)
  demoPatientId String?
  demoPatient   PatientProfile?      @relation(fields: [demoPatientId], references: [id], onDelete: SetNull)
  completedAt   DateTime?
  chapters      OnboardingChapterProgress[]
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt

  @@unique([userId, tourId])
  @@index([userId])
}

model OnboardingChapterProgress {
  id             String                   @id @default(uuid())
  progressId     String
  progress       OnboardingProgress       @relation(fields: [progressId], references: [id], onDelete: Cascade)
  chapterId      String
  status         OnboardingChapterStatus
  furthestStepId String?
  completedAt    DateTime?

  @@unique([progressId, chapterId])
}
```

- [ ] **Step 2: Migrate and generate**

Run: `pnpm --filter @nutri-plus/api db:migrate --name onboarding_progress`
Then: `pnpm --filter @nutri-plus/api prisma:generate`
Expected: migration SQL created; client has `onboardingProgress`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): onboarding progress tables and prompt timestamp"
```

---

### Task 3: API — demo patient create, `isDemo`, demo-only delete

**Files:**
- Modify: `apps/api/src/auth/auth.constants.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/patients/dto/create-patient.dto.ts`
- Modify: `apps/api/src/patients/patients.service.ts`
- Modify: `apps/api/src/patients/patients.controller.ts`
- Test: `apps/api/src/patients/patients.service.spec.ts` (extend `createPatient`; add `deleteDemoPatient`)
- Test: `apps/api/src/users/users.service.spec.ts` if `createDemoPatient` is covered there; otherwise only patients spec.

**Interfaces:**
- Consumes: `DEMO_PROVIDER = 'demo'`; `CreatePatientDto.demo?: boolean`; Prisma `onboardingProgress.upsert`.
- Produces:
  - `UsersService.createDemoPatient({ email, name, nutritionistId, clinical })` → `LocalUser` with `authProvider: 'demo'`.
  - `PatientsService.createPatient` skips invite when `dto.demo`; upserts progress `tourId: 'patients'` with `demoPatientId`; returns `isDemo: true`.
  - `PatientsService.deleteDemoPatient(ctx, id)` — 404 if missing/not owned; 403 if not demo; deletes user+profile (same cascade family as `deleteMyAccount` children as needed).
  - `DELETE /v1/patients/:id` nutritionist-only.

- [ ] **Step 1: Write the failing create-demo tests** (append inside `describe('createPatient')` in `patients.service.spec.ts`)

```ts
it('demo: true skips invite, forces app toggles off, upserts progress, returns isDemo', async () => {
  users.createDemoPatient.mockResolvedValue({
    patientProfile: { id: 'pp-demo' },
  } as any);
  prisma.onboardingProgress.upsert.mockResolvedValue({} as any);
  prisma.patientProfile.findFirst.mockResolvedValue({
    id: 'pp-demo',
    height: null,
    assessments: [],
    consents: [],
    user: { id: 'u-d', name: 'Maria Demonstração', email: 'demo.user-1.1@example.com', authProvider: 'demo' },
  } as any);

  const result = await service.createPatient(ctx, {
    name: 'Maria Demonstração',
    email: 'demo.user-1.1@example.com',
    demo: true,
  } as any);

  expect(supabaseAdmin.inviteUser).not.toHaveBeenCalled();
  expect(users.createDemoPatient).toHaveBeenCalledWith(expect.objectContaining({
    email: 'demo.user-1.1@example.com',
    name: 'Maria Demonstração',
    nutritionistId: 'nutri-1',
    clinical: expect.objectContaining({ canLogAssessments: false, showMealTargetToPatient: false }),
  }));
  expect(prisma.onboardingProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId_tourId: { userId: 'user-1', tourId: 'patients' } },
    create: expect.objectContaining({ userId: 'user-1', tourId: 'patients', demoPatientId: 'pp-demo' }),
    update: expect.objectContaining({ demoPatientId: 'pp-demo' }),
  }));
  expect(result.isDemo).toBe(true);
});

it('demo: true still creates when email matches UNDELIVERABLE_EMAIL', async () => {
  users.createDemoPatient.mockResolvedValue({ patientProfile: { id: 'pp-demo' } } as any);
  prisma.onboardingProgress.upsert.mockResolvedValue({} as any);
  prisma.patientProfile.findFirst.mockResolvedValue({
    id: 'pp-demo', height: null, assessments: [], consents: [],
    user: { id: 'u-d', name: 'Maria Demonstração', email: 'x@example.com', authProvider: 'demo' },
  } as any);
  await service.createPatient(ctx, { name: 'Maria Demonstração', email: 'x@example.com', demo: true } as any);
  expect(supabaseAdmin.inviteUser).not.toHaveBeenCalled();
});

it('without demo still rejects example.com before inviting', async () => {
  await expect(
    service.createPatient(ctx, { name: 'Ann', email: 'qa@example.com' } as any),
  ).rejects.toBeInstanceOf(UnprocessableEntityException);
  expect(supabaseAdmin.inviteUser).not.toHaveBeenCalled();
});
```

Add:

```ts
describe('deleteDemoPatient', () => {
  it('403 when the patient is not a demo identity', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({
      id: 'pp1',
      userId: 'u1',
      user: { authProvider: 'SUPABASE' },
    } as any);
    await expect(service.deleteDemoPatient(ctx, 'pp1')).rejects.toMatchObject({ status: 403 });
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('deletes the demo user (cascades profile) when authProvider is demo', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({
      id: 'pp-demo',
      userId: 'u-d',
      user: { authProvider: 'demo' },
    } as any);
    prisma.user.delete.mockResolvedValue({} as any);
    await service.deleteDemoPatient(ctx, 'pp-demo');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u-d' } });
  });
});
```

Existing `createPatient` include assertion currently expects `user: { select: { id, name, email } }`. After this task it must also select `authProvider` (used to derive `isDemo`, then stripped). Update that expectation in the same commit.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @nutri-plus/api test patients.service.spec`
Expected: FAIL (`createDemoPatient` / `deleteDemoPatient` missing, `isDemo` undefined).

- [ ] **Step 3: Implement**

`auth.constants.ts` add: `export const DEMO_PROVIDER = 'demo';`

`UsersService.createDemoPatient` — copy `createInvitedPatient` but `authProvider: DEMO_PROVIDER`, `authProviderId: randomUUID()`, and force clinical `canLogAssessments: false`, `showMealTargetToPatient: false` (callers also pass that).

`CreatePatientDto`:

```ts
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

@IsOptional()
@IsBoolean()
demo?: boolean;
```

`createPatient`: if `dto.demo`, skip `UNDELIVERABLE_EMAIL` and `inviteUser`; call `createDemoPatient`; `prisma.onboardingProgress.upsert` for `ctx.user!.id` + `'patients'`. Always map `isDemo: patient.user.authProvider === DEMO_PROVIDER` and omit `authProvider` from `user` in list/detail mappers.

`USER_SUMMARY` becomes `{ select: { id: true, name: true, email: true, authProvider: true } }`. In list `map` and `toDetail`, replace `user` with `{ id, name, email }` and set `isDemo`.

`deleteDemoPatient`: `requireOwned`, load user.authProvider, if not demo `ForbiddenException('Only demo patients can be deleted this way')`; `prisma.user.delete({ where: { id: userId } })` (profile cascades; `OnboardingProgress.demoPatientId` SetNull).

Controller:

```ts
@Delete(':id')
@HttpCode(HttpStatus.NO_CONTENT)
removeDemo(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
  return this.patients.deleteDemoPatient(ctx, id);
}
```

Place this **before** more specific `':id/...'` routes if Nest would clash; `'patients/:id'` vs `'patients/:id/photo'` is fine as long as `photo` is a static segment.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @nutri-plus/api test patients.service.spec users.service.spec`
Expected: PASS. Existing invite path still green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/auth.constants.ts apps/api/src/users apps/api/src/patients
git commit -m "feat(api): create demo patients without invite and demo-only delete"
```

---

### Task 4: API — GET/PATCH `/v1/me/onboarding`

**Files:**
- Create: `apps/api/src/onboarding/onboarding.module.ts`
- Create: `apps/api/src/onboarding/onboarding.service.ts`
- Create: `apps/api/src/onboarding/onboarding.controller.ts`
- Create: `apps/api/src/onboarding/dto/dismiss-prompt.dto.ts`
- Create: `apps/api/src/onboarding/dto/patch-tour.dto.ts`
- Create: `apps/api/src/onboarding/onboarding.service.spec.ts`
- Modify: `apps/api/src/app.module.ts` (import `OnboardingModule`)

**Interfaces:**
- Consumes: `OnboardingMeView`, `PatchOnboardingTourRequest`, `isOnboardingTourId`, Prisma models from Task 2, `ctx.user.id`.
- Produces:
  - `OnboardingService.getMine(userId): Promise<OnboardingMeView>`
  - `OnboardingService.dismissPrompt(userId): Promise<OnboardingMeView>` — sets `onboardingPromptDismissedAt` only if null
  - `OnboardingService.patchTour(userId, tourId, dto): Promise<OnboardingMeView>`
  - `GET /v1/me/onboarding`
  - `PATCH /v1/me/onboarding` body `{ promptDismissed: true }`
  - `PATCH /v1/me/onboarding/:tourId`
  - Roles: `NUTRITIONIST` and `EMPLOYEE`. Unknown `tourId` → 400.

Monotonic rules (spec):
- Chapter `COMPLETED`/`SKIPPED`: identical PATCH → 200; changing status/furthestStepId/completedAt → `BadRequestException`.
- Tour `COMPLETED` does not return to `IN_PROGRESS`. `tourStatus: 'COMPLETED'` only once; `completedAt` set then.
- Missing progress row: first chapter write upserts `IN_PROGRESS`.
- `demoPatientId` update allowed when current is null (or just write the value; SetNull already cleared deletes).

- [ ] **Step 1: Write the failing service tests**

`apps/api/src/onboarding/onboarding.service.spec.ts` — mock `PrismaService` with `jest-mock-extended` like `entitlements.service.spec.ts`.

```ts
import { BadRequestException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingService } from './onboarding.service';

function makePrisma() {
  return mockDeep<PrismaService>();
}

describe('OnboardingService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let svc: OnboardingService;
  beforeEach(() => {
    prisma = makePrisma();
    svc = new OnboardingService(prisma);
  });

  it('GET returns empty tours and null prompt when nothing stored', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: null } as any);
    prisma.onboardingProgress.findMany.mockResolvedValue([]);
    await expect(svc.getMine('u1')).resolves.toEqual({ promptDismissedAt: null, tours: [] });
  });

  it('dismissPrompt sets timestamp only once', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: null } as any);
    prisma.user.update.mockResolvedValue({ onboardingPromptDismissedAt: new Date('2026-08-21') } as any);
    prisma.onboardingProgress.findMany.mockResolvedValue([]);
    const out = await svc.dismissPrompt('u1');
    expect(prisma.user.update).toHaveBeenCalled();
    expect(out.promptDismissedAt).toBeTruthy();

    prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: new Date('2026-08-21') } as any);
    prisma.user.update.mockClear();
    await svc.dismissPrompt('u1');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects unknown tourId', async () => {
    await expect(svc.patchTour('u1', 'agenda', { chapterId: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts first chapter write as IN_PROGRESS', async () => {
    prisma.onboardingProgress.findUnique.mockResolvedValue(null);
    prisma.onboardingProgress.upsert.mockResolvedValue({
      id: 'pr1', status: 'IN_PROGRESS', tourId: 'patients', demoPatientId: null, completedAt: null, chapters: [],
    } as any);
    prisma.onboardingChapterProgress.upsert.mockResolvedValue({} as any);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: null } as any);
    prisma.onboardingProgress.findMany.mockResolvedValue([]);
    await svc.patchTour('u1', 'patients', { chapterId: 'lista', chapterStatus: 'IN_PROGRESS', furthestStepId: 'search' });
    expect(prisma.onboardingProgress.upsert).toHaveBeenCalled();
  });

  it('400 when mutating a COMPLETED chapter', async () => {
    prisma.onboardingProgress.findUnique.mockResolvedValue({
      id: 'pr1', status: 'IN_PROGRESS', completedAt: null, demoPatientId: null,
      chapters: [{ id: 'c1', chapterId: 'lista', status: 'COMPLETED', furthestStepId: 'new', completedAt: new Date() }],
    } as any);
    await expect(
      svc.patchTour('u1', 'patients', { chapterId: 'lista', chapterStatus: 'IN_PROGRESS' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('idempotent COMPLETED → COMPLETED is ok', async () => {
    prisma.onboardingProgress.findUnique.mockResolvedValue({
      id: 'pr1', status: 'IN_PROGRESS', completedAt: null, demoPatientId: null,
      chapters: [{ id: 'c1', chapterId: 'lista', status: 'COMPLETED', furthestStepId: 'new', completedAt: new Date() }],
    } as any);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: null } as any);
    prisma.onboardingProgress.findMany.mockResolvedValue([]);
    await expect(
      svc.patchTour('u1', 'patients', { chapterId: 'lista', chapterStatus: 'COMPLETED' }),
    ).resolves.toBeDefined();
  });

  it('does not reopen a COMPLETED tour', async () => {
    prisma.onboardingProgress.findUnique.mockResolvedValue({
      id: 'pr1', status: 'COMPLETED', completedAt: new Date(), demoPatientId: 'p',
      chapters: [],
    } as any);
    await expect(
      svc.patchTour('u1', 'patients', { chapterId: 'lista', chapterStatus: 'IN_PROGRESS' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/api test onboarding.service.spec`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement service + controller + DTOs + module**

Map rows to ISO strings. `getMine` reads `user.onboardingPromptDismissedAt` + `onboardingProgress.findMany({ where: { userId }, include: { chapters: true } })`.

`patchTour`: `if (!isOnboardingTourId(tourId)) throw new BadRequestException('Unknown tour')`.

Controller:

```ts
@Controller({ path: 'me/onboarding', version: '1' })
@Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
@ApiTags('onboarding')
@ApiBearerAuth()
```

`GET /` → `getMine(ctx.user!.id)`.
`PATCH /` → `dismissPrompt`.
`PATCH /:tourId` → `patchTour`.

Register `OnboardingModule` in `app.module.ts` imports.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @nutri-plus/api test onboarding`
Expected: PASS (types spec + service spec).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/onboarding apps/api/src/app.module.ts
git commit -m "feat(api): per-user onboarding progress GET/PATCH"
```

---

### Task 5: Web — API client and react-query hooks

**Files:**
- Create: `apps/web/src/lib/api/onboarding.ts`
- Create: `apps/web/src/lib/queries/onboarding.ts`
- Create: `apps/web/src/lib/api/onboarding.test.ts`
- Modify: `apps/web/src/lib/api/patients.ts` — `createPatient` already sends body; `demo` rides along. Add `deleteDemoPatient(id)`.
- Modify: `apps/web/src/lib/queries/patients.ts` — `useDeleteDemoPatient`

**Interfaces:**
- Consumes: `OnboardingMeView`, `PatchOnboardingTourRequest`, `browserApiFetch`.
- Produces:
  - `getOnboarding(): Promise<OnboardingMeView>`
  - `dismissOnboardingPrompt(): Promise<OnboardingMeView>`
  - `patchOnboardingTour(tourId: string, body: PatchOnboardingTourRequest): Promise<OnboardingMeView>`
  - `deleteDemoPatient(id: string): Promise<void>`
  - `ONBOARDING_KEY = ['onboarding'] as const`
  - `useOnboarding()`, `useDismissOnboardingPrompt()`, `usePatchOnboardingTour()`, `useDeleteDemoPatient()`

- [ ] **Step 1: Write the failing client test**

Mock `browserApiFetch` like other `lib/api/*.test.ts` if they exist; if not, test the path strings with a vi.mock:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
vi.mock('@/lib/api/browser', () => ({ browserApiFetch: (...a: unknown[]) => browserApiFetch(...a) }));

import { dismissOnboardingPrompt, getOnboarding, patchOnboardingTour } from './onboarding';
import { deleteDemoPatient } from './patients';

beforeEach(() => browserApiFetch.mockReset());

it('GET /me/onboarding', async () => {
  browserApiFetch.mockResolvedValue({ promptDismissedAt: null, tours: [] });
  await getOnboarding();
  expect(browserApiFetch).toHaveBeenCalledWith('/me/onboarding');
});

it('PATCH prompt and tour', async () => {
  browserApiFetch.mockResolvedValue({ promptDismissedAt: 'x', tours: [] });
  await dismissOnboardingPrompt();
  expect(browserApiFetch).toHaveBeenCalledWith('/me/onboarding', { method: 'PATCH', body: { promptDismissed: true } });
  await patchOnboardingTour('patients', { chapterId: 'lista', chapterStatus: 'COMPLETED' });
  expect(browserApiFetch).toHaveBeenCalledWith('/me/onboarding/patients', {
    method: 'PATCH',
    body: { chapterId: 'lista', chapterStatus: 'COMPLETED' },
  });
});

it('DELETE demo patient', async () => {
  browserApiFetch.mockResolvedValue(undefined);
  await deleteDemoPatient('p1');
  expect(browserApiFetch).toHaveBeenCalledWith('/patients/p1', { method: 'DELETE' });
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @nutri-plus/web test src/lib/api/onboarding`
Expected: FAIL.

- [ ] **Step 3: Implement client + hooks** (same pattern as `lib/api/subscription.ts` / `lib/queries/subscription.ts`). `usePatchOnboardingTour` invalidates `ONBOARDING_KEY` on success. `useCreatePatient` already invalidates patients; also invalidate onboarding after demo create (in Task 9/10 when `demo: true` is sent — for now invalidate onboarding in `useCreatePatient` onSuccess always: cheap).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @nutri-plus/web test src/lib/api/onboarding`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api/onboarding.ts apps/web/src/lib/api/onboarding.test.ts apps/web/src/lib/queries/onboarding.ts apps/web/src/lib/api/patients.ts apps/web/src/lib/queries/patients.ts
git commit -m "feat(web): onboarding API client and demo-patient delete"
```

---

### Task 6: Catalog, progress helpers, fixture registry

**Files:**
- Create: `apps/web/src/lib/onboarding/catalog.ts`
- Create: `apps/web/src/lib/onboarding/progress.ts`
- Create: `apps/web/src/lib/onboarding/fixtures.ts`
- Create: `apps/web/src/lib/onboarding/session.ts`
- Test: `apps/web/src/lib/onboarding/progress.test.ts`
- Test: `apps/web/src/lib/onboarding/session.test.ts`
- Test: `apps/web/src/lib/onboarding/fixtures.test.ts`

**Interfaces:**
- Consumes: `OnboardingTourProgressView`, `Entitlements`.
- Produces (lock these names):

```ts
export type Advance = 'click' | 'next';
export type TourStep = {
  id: string;
  route: string | ((ctx: { demoPatientId: string }) => string);
  anchor: string; // CSS selector, e.g. '[data-tour="patients.new"]'
  title: string;
  body: string;
  advance: Advance;
  fixture?: string;
};
export type TourChapter = {
  id: string;
  title: string;
  requires?: 'ai';
  requiresDemo?: boolean;
  steps: TourStep[];
};
export type TourDefinition = { id: 'patients'; title: string; summary: string; chapters: TourChapter[] };
export const PATIENTS_TOUR: TourDefinition;
export function getTour(id: string): TourDefinition | undefined;

export function isAiChapterLocked(entitlements: Entitlements | undefined): boolean;
export function chapterView(chapter: TourChapter, tour: OnboardingTourProgressView | undefined, entitlements: Entitlements | undefined): {
  status: 'todo' | 'in_progress' | 'completed' | 'skipped' | 'locked';
  lockReason: 'ai' | 'demo' | null;
};
export function primaryCta(tour: OnboardingTourProgressView | undefined): 'start' | 'continue' | 'review';
export function firstIncompleteChapterId(def: TourDefinition, tour: OnboardingTourProgressView | undefined, entitlements: Entitlements | undefined): string | null;

export function parseTourSearch(search: string): { tourId: string; chapterId: string; replay: boolean } | null;
export function buildTourSearch(opts: { tourId: string; chapterId: string; replay: boolean }): string;

export function registerFixture(id: string, run: () => void): () => void;
export function runFixture(id: string): void;
```

Chapter ids **must** be: `lista`, `cadastro`, `ficha`, `anamnese`, `bioimpedancia`, `metas`, `recordatorio-diario`, `plano-manual`, `gerar-ia`.

`requiresDemo: true` on every chapter except `lista` and `cadastro`.
`requires: 'ai'` only on `gerar-ia`.
`isAiChapterLocked`: `!entitlements || entitlements.isReadOnly || entitlements.aiUsed >= entitlements.aiQuota`.

`primaryCta`: no row → `start`; `IN_PROGRESS` → `continue`; `COMPLETED` → `review`.

Copy (pt-BR):
- Tour title: `Pacientes`
- Summary: `Cadastro, ficha, avaliações e planos alimentares.`
- Chapter titles: `Lista`, `Cadastro`, `Ficha`, `Anamnese`, `Bioimpedância`, `Metas`, `Recordatório e diário`, `Plano manual`, `Gerar com IA`
- Step titles/bodies: short; include the IA warning on the generate-click step: `Isso consome 1 ação de IA da cota mensal.`

Minimal steps per chapter (expand later only if a click has no anchor):
1. `lista`: `next` on `[data-tour="patients.search"]` (if missing, use the heading `[data-tour="patients.list"]`); `click` `[data-tour="patients.new"]`
2. `cadastro`: `next` `[data-tour="patients.create.form"]`; fixture `create-patient`; `click` `[data-tour="patients.create.submit"]`
3. `ficha`: `next` `[data-tour="patients.detail.header"]`; `click` `[data-tour="patients.tab.dados"]`
4. `anamnese`: `click` `[data-tour="patients.tab.anamnese"]`; fixture `anamnese`; `click` `[data-tour="patients.anamnese.save"]`
5. `bioimpedancia`: `click` `[data-tour="patients.tab.bioimpedancia"]`; fixture `assessment`; `click` `[data-tour="patients.assessment.save"]`; `next` `[data-tour="patients.export-evolution"]`
6. `metas`: `click` `[data-tour="patients.tab.metas"]`; `next` `[data-tour="patients.metas"]`
7. `recordatorio-diario`: `click` `[data-tour="patients.tab.recordatorio"]`; fixture `food-recall`; `click` `[data-tour="patients.recall.save"]`; `click` `[data-tour="patients.tab.diario"]`; `next` `[data-tour="patients.diario"]`
8. `plano-manual`: `click` `[data-tour="patients.tab.planos"]`; `click` `[data-tour="patients.plan.new"]`; fixture `meal-plan`; `click` `[data-tour="patients.plan.save"]`; `click` `[data-tour="patients.plan.pdf"]`
9. `gerar-ia`: `click` `[data-tour="patients.tab.planos"]`; `click` `[data-tour="patients.plan.ai"]`; fixture `ai-instructions`; `click` `[data-tour="patients.plan.ai.confirm"]`

Routes: `/patients`, `/patients/new`, `(ctx) => /patients/${ctx.demoPatientId}`, `(ctx) => /patients/${ctx.demoPatientId}/planos/novo`.

- [ ] **Step 1: Write failing helper tests**

`progress.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PATIENTS_TOUR, chapterView, firstIncompleteChapterId, isAiChapterLocked, primaryCta } from './progress';
// re-export helpers from progress.ts that import PATIENTS_TOUR from catalog

const pro = { isReadOnly: false, aiQuota: 200, aiUsed: 1, tier: 'PRO' as const, features: { silhueta: true, transcription: true, employees: true } };
const exhausted = { ...pro, aiUsed: 200 };

it('starts when there is no progress row', () => {
  expect(primaryCta(undefined)).toBe('start');
});

it('locks IA when quota is exhausted', () => {
  expect(isAiChapterLocked(exhausted)).toBe(true);
  const ch = PATIENTS_TOUR.chapters.find((c) => c.id === 'gerar-ia')!;
  expect(chapterView(ch, undefined, exhausted).status).toBe('locked');
});

it('blocks ficha without demo patient', () => {
  const ch = PATIENTS_TOUR.chapters.find((c) => c.id === 'ficha')!;
  expect(chapterView(ch, { tourId: 'patients', status: 'IN_PROGRESS', demoPatientId: null, completedAt: null, chapters: [] }, pro).lockReason).toBe('demo');
});

it('continues at first non-terminal unlocked chapter', () => {
  const tour = {
    tourId: 'patients' as const,
    status: 'IN_PROGRESS' as const,
    demoPatientId: 'p1',
    completedAt: null,
    chapters: [
      { chapterId: 'lista', status: 'COMPLETED' as const, furthestStepId: 'new', completedAt: 'x' },
      { chapterId: 'cadastro', status: 'SKIPPED' as const, furthestStepId: null, completedAt: 'x' },
    ],
  };
  expect(firstIncompleteChapterId(PATIENTS_TOUR, tour, pro)).toBe('ficha');
});
```

Export `PATIENTS_TOUR` from `catalog.ts` and re-export from `progress.ts` so tests import one module, **or** import catalog in the test. Prefer tests import `./catalog` + `./progress` separately if `PATIENTS_TOUR` lives in catalog — then fix the import in the snippet above to `from './catalog'` and `from './progress'`.

`session.test.ts`: `parseTourSearch('?tour=patients&chapter=cadastro&replay=1')` → `{ tourId: 'patients', chapterId: 'cadastro', replay: true }`; missing tour → `null`.

`fixtures.test.ts`: register, run, unregister (returned disposer); unknown id is no-op.

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @nutri-plus/web test src/lib/onboarding`
Expected: FAIL.

- [ ] **Step 3: Implement catalog (full chapter/step objects), progress.ts, fixtures.ts, session.ts**

`runFixture` no-ops if missing (never throws).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @nutri-plus/web test src/lib/onboarding`
Expected: PASS. Also assert `PATIENTS_TOUR.chapters.map(c => c.id)` equals the 9 ids in order.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/onboarding
git commit -m "feat(web): patients tour catalog, progress helpers, fixtures"
```

---

### Task 7: Tour engine (provider + tooltip + driver.js)

**Files:**
- Create: `apps/web/src/components/onboarding/tour-tooltip.tsx`
- Create: `apps/web/src/components/onboarding/tour-provider.tsx`
- Create: `apps/web/src/components/onboarding/tour-provider.test.tsx`
- Modify: `apps/web/package.json` — add `driver.js` (latest 1.x). Run `pnpm --filter @nutri-plus/web add driver.js`.

**Interfaces:**
- Consumes: catalog, `parseTourSearch`/`buildTourSearch`, `runFixture`, `usePatchOnboardingTour`, `useOnboarding`, `useRouter`/`usePathname`/`useSearchParams`.
- Produces:
  - `TourProvider({ children, role }: { children: React.ReactNode; role: UserRole | null })`
  - `useTour(): { start(opts: { tourId: 'patients'; chapterId: string; replay: boolean }): void; exit(): void; skipChapter(): void }`
  - Tooltip buttons: **Pular capítulo**, **Sair**, **Preencher com dados fictícios** (only if `step.fixture`), **Próximo** (only if `advance === 'next'`).
  - `start` writes URL search via `router.replace`.
  - `mode === 'play'` → PATCH chapter IN_PROGRESS on start and COMPLETED/SKIPPED on finish/skip. `mode === 'replay'` → **zero** `mutateAsync` calls.
  - Click `advance`: native click proceeds; capture listener on `document` filtered to `event.target.closest(step.anchor)`.
  - Replay + chapter `cadastro` + step submit: `preventDefault`+`stopPropagation` on the submit control and `router.push(/patients/${demoPatientId})`.
  - Anchor wait: poll `document.querySelector(anchor)` every 100ms, timeout 5000ms → render “Não encontrei este passo” + button **Voltar ao hub** (`/primeiros-passos`), do not PATCH COMPLETED.
  - After click, if next step route differs, `router.push(route)`.

Mock `driver.js` in tests:

```ts
const highlight = vi.fn();
const destroy = vi.fn();
vi.mock('driver.js', () => ({ driver: () => ({ highlight, destroy }) }));
```

- [ ] **Step 1: Add dependency, write failing tests**

Install `driver.js`. Test file wraps with QueryClient + a stub `useOnboarding`/`usePatchOnboardingTour`.

```tsx
const patch = vi.fn();
vi.mock('@/lib/queries/onboarding', () => ({
  useOnboarding: () => ({ data: { promptDismissedAt: null, tours: [] } }),
  usePatchOnboardingTour: () => ({ mutateAsync: patch }),
}));

it('replay does not patch', async () => {
  render(
    <TourProvider role={UserRole.NUTRITIONIST}>
      <Probe />
    </TourProvider>,
  );
  fireEvent.click(screen.getByText('start-replay'));
  expect(patch).not.toHaveBeenCalled();
});

it('play skip patches SKIPPED', async () => {
  // Probe calls start({ replay: false }) then skipChapter
  expect(patch).toHaveBeenCalledWith('patients', expect.objectContaining({ chapterStatus: 'SKIPPED' }));
});
```

`Probe` uses `useTour()` and exposes buttons. Include a dummy `[data-tour="patients.new"]` in the tree so highlight has a target.

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @nutri-plus/web test tour-provider`
Expected: FAIL.

- [ ] **Step 3: Implement tooltip + provider**

`driver.js` options: `allowClose: false`, overlay click does not advance. Hide the stock popover (`showButtons: []` / empty popover) and render `TourTooltip` positioned with `getBoundingClientRect()` of the highlighted element. Buttons are always ours.

Import `'driver.js/dist/driver.css'` in `tour-provider.tsx`.

Do not start a tour for `role === EMPLOYEE` even if URL has params — `start` no-ops.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @nutri-plus/web test tour-provider`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/src/components/onboarding pnpm-lock.yaml
git commit -m "feat(web): product-tour engine with click-to-advance and replay"
```

---

### Task 8: Hub, sidebar, first-run dialog

**Files:**
- Create: `apps/web/src/components/onboarding/hub-view.tsx`
- Create: `apps/web/src/components/onboarding/hub-view.test.tsx`
- Create: `apps/web/src/components/onboarding/first-run-dialog.tsx`
- Create: `apps/web/src/components/onboarding/first-run-dialog.test.tsx`
- Create: `apps/web/src/app/(app)/primeiros-passos/page.tsx`
- Modify: `apps/web/src/components/app/nav-items.ts`
- Modify: `apps/web/src/components/app/app-sidebar.test.tsx`

**Interfaces:**
- Consumes: `useOnboarding`, `useSubscription`, `useTour`, `primaryCta`, `chapterView`, `PATIENTS_TOUR`, `UserRole`.
- Produces:
  - Hub route `/primeiros-passos` (client view inside server page that only checks `isWebDashboardRole` like other pages).
  - Nav item `{ label: 'Primeiros passos', href: '/primeiros-passos', icon: GraduationCap }` **after Contabilidade, before Configurações**.
  - CTA **Começar** / **Continuar** / **Concluído**+**Rever**.
  - Employee: Começar disabled; text `Este tutorial é feito pelo nutricionista (cadastro de pacientes).`
  - Locked IA chapter: cadeado + CTA link `/assinatura`.
  - Rever on completed/skipped chapters calls `start({ replay: true, chapterId })`.
  - First-run dialog title `Conheça o iNutri`; buttons **Ver primeiros passos** (navigate `/primeiros-passos`) and **Agora não** (dismiss mutation). Shows only when `promptDismissedAt == null` and no tour `IN_PROGRESS`/`COMPLETED` and `onboardedAt != null` (if subscription loaded). Mount next to `OnboardingGate` in Task 10; this task tests the dialog in isolation.

- [ ] **Step 1: Write failing tests**

Hub:
- NUTRITIONIST + empty progress → button Começar.
- IN_PROGRESS → Continuar.
- COMPLETED → Concluído and Rever.
- EMPLOYEE → no enabled Começar; helper text present.
- IA locked → chapter labeled locked (text `/pro|cota|assinatura/i`).

Dialog:
- Renders when `open`.
- **Agora não** calls `onDismiss`.
- **Ver primeiros passos** calls `onStart`.

Sidebar: `expect(screen.getByRole('link', { name: /primeiros passos/i })).toHaveAttribute('href', '/primeiros-passos')` in `app-sidebar.test.tsx`. Keep the Alimentos-after-Pacientes assertion.

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @nutri-plus/web test hub-view first-run-dialog app-sidebar`
Expected: FAIL.

- [ ] **Step 3: Implement hub, dialog, page, nav item**

Page:

```tsx
import { HubView } from '@/components/onboarding/hub-view';
export default function PrimeirosPassosPage() {
  return <HubView />;
}
```

`HubView` reads `useCurrentUser` if available; otherwise accept `role` via a small wrapper that uses the same `getCurrentUser` pattern as other client views — check how `patients/page.tsx` passes `canCreate`. Mirror that: server page loads `me`, passes `role={me.role}`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @nutri-plus/web test hub-view first-run-dialog app-sidebar nav-items`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/onboarding apps/web/src/app/(app)/primeiros-passos apps/web/src/components/app/nav-items.ts apps/web/src/components/app/app-sidebar.test.tsx
git commit -m "feat(web): Primeiros passos hub, nav item, and first-run dialog"
```

---

### Task 9: `data-tour` anchors + fixture registration on real forms

**Files:**
- Modify: `patients-list.tsx` — `data-tour="patients.list"` on the wrapper or h1; `data-tour="patients.search"` on the search input; `data-tour="patients.new"` on the Novo paciente **Link/Button**.
- Modify: `create-patient-form.tsx` — `data-tour="patients.create.form"` on the form; `data-tour="patients.create.submit"` on submit; `registerFixture('create-patient', ...)` in `useEffect`.
- Modify: `patient-detail.tsx` — header, tabs (`patients.tab.*`), `patients.export-evolution` on Exportar evolução.
- Modify: `anamnese-section.tsx` — save button `patients.anamnese.save` + fixture `anamnese`.
- Modify: `assessment-dialog.tsx` / `bioimpedance-section.tsx` — `patients.assessment.save` + fixture `assessment`.
- Modify: `nutrition-targets-section.tsx` — `data-tour="patients.metas"`.
- Modify: `recordatorio-section.tsx` / editor save — `patients.recall.save` + fixture `food-recall`.
- Modify: `meal-diary-section.tsx` — `data-tour="patients.diario"` on the `<section>`.
- Modify: `meal-plans-section.tsx` — `patients.plan.new`, `patients.plan.ai`.
- Modify: `meal-plan-editor.tsx` — `patients.plan.save`, `patients.plan.pdf`, fixture `meal-plan`.
- Modify: `ai-generate-dialog.tsx` — confirm `patients.plan.ai.confirm`, fixture `ai-instructions` when open.
- Test: extend existing component tests with one assertion each that the primary CTA has the `data-tour` attribute (do not duplicate full flows).

**Interfaces:**
- Consumes: `registerFixture` from Task 6; RHF `reset`/`setValue`.
- Produces: every `anchor` string in `PATIENTS_TOUR` exists in the DOM when that screen is mounted.

Fixture payloads (pt-BR, valid):
- `create-patient`: `{ name: 'Maria Demonstração', email: \`demo.${userIdSlice}.${Date.now()}@example.com\`, birthDate: '1990-05-12', gender: 'FEMALE', height: '165', objective: 'WEIGHT_LOSS', activityLevel: 'MODERATE' }` plus `demo: true` on **submit** (see next step). The fixture only fills the form; submit still uses `handleSubmit`. To send `demo: true`, add a `useTour` flag **or** a module flag `isPlayCadastro()` from the provider. Simplest: `createPatientForm` reads `useTour()?.isPlayCadastroSubmit()` and if true appends `demo: true` to the mutate body. If `useTour` outside provider, default false.
- `anamnese` / `assessment` / `food-recall`: fill required fields with obvious dummy values already accepted by those schemas (read the zod schema in the same folder; do not invent invalid numbers).
- `meal-plan`: `title: 'Plano demonstração'`, one meal `Café da manhã` / option `Opção A` / item `Aveia` `40 g`.
- `ai-instructions`: textarea `Gerar um plano simples de demonstração, 3 refeições.`

- [ ] **Step 1: Write/adjust failing tests** (examples)

`patients-list.test.tsx`:
```ts
expect(screen.getByRole('link', { name: /novo paciente/i })).toHaveAttribute('data-tour', 'patients.new');
```

`create-patient-form.test.tsx`:
```ts
expect(screen.getByRole('button', { name: /criar paciente/i })).toHaveAttribute('data-tour', 'patients.create.submit');
```

`meal-plans-section.test.tsx`: Gerar com IA / Novo plano attributes `patients.plan.ai` / `patients.plan.new`.

- [ ] **Step 2: Run the touched component tests — expect FAIL on missing attributes**

Run: `pnpm --filter @nutri-plus/web test patients-list create-patient-form meal-plans-section`
Expected: FAIL.

- [ ] **Step 3: Add attributes + registerFixture effects**

`create-patient-form` submit path: if a tour session is play + chapter cadastro, `mutateAsync({ ...values, demo: true })`.

Export `useTour` that returns null-safe defaults when no provider (tests that don't wrap provider must still pass). Implement `useTour` with a context default `{ start(){}, exit(){}, skipChapter(){}, isPlayCadastroSubmit(){ return false } }`.

- [ ] **Step 4: Re-run those tests plus anamnese/bioimpedance/meal-plan-editor if you added assertions**

Run: `pnpm --filter @nutri-plus/web test patients-list create-patient-form meal-plans-section patient-detail anamnese meal-plan-editor`
Expected: PASS (existing behavior intact).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/patients apps/web/src/components/onboarding
git commit -m "feat(web): data-tour anchors and onboarding form fixtures"
```

---

### Task 10: Wire layout, first-run, delete-demo banner, IA lock on hub

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx` — wrap inset children with `TourProvider role={me?.role ?? null}`; render `FirstRunDialog` host after `OnboardingGate`.
- Create: `apps/web/src/components/onboarding/first-run-host.tsx` (client; uses `useOnboarding` + `useSubscription`).
- Create: `apps/web/src/components/onboarding/delete-demo-banner.tsx` + test.
- Modify: `hub-view.tsx` — show delete-demo banner when `demoPatientId` set (any status).
- Modify: `apps/web/src/app/(app)/layout.tsx` tests if they exist; otherwise test `first-run-host.test.tsx`.

**Interfaces:**
- Consumes: Tasks 7–9.
- Produces: working loop from sidebar → hub → start → click through first chapter (engine). First-run after billing onboard. Delete demo uses `useDeleteDemoPatient`.

First-run host rules:
- `subscription.data?.onboardedAt` null → render nothing (billing gate owns that).
- `onboarding.data` missing → nothing.
- `promptDismissedAt` set → nothing.
- any tour status `IN_PROGRESS` or `COMPLETED` → nothing.
- else open dialog.

Delete banner copy: `Este é um paciente de demonstração.` Button **Apagar paciente de demonstração**; second click **Confirmar exclusão**. After success, invalidate onboarding + patients.

- [ ] **Step 1: Failing tests**

`first-run-host.test.tsx`:
- `onboardedAt: null` → no dialog.
- `promptDismissedAt` set → no dialog.
- empty tours + onboardedAt ISO → dialog title Conheça o iNutri.

`delete-demo-banner.test.tsx`:
- renders button; click confirm calls delete with the id.

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @nutri-plus/web test first-run-host delete-demo-banner`
Expected: FAIL.

- [ ] **Step 3: Implement host + banner + layout wiring**

`TourProvider` must be **inside** `Providers` (react-query) and **inside** `SidebarProvider` so it can open the mobile sheet if you implement that; if mobile sheet open is too much, skip sheet-open (spec allowed “tour runs”; opening sidebar is best-effort). Do not block the task on mobile sheet.

- [ ] **Step 4: Full web + api tests**

Run:
`pnpm --filter @nutri-plus/shared-types build`
`pnpm --filter @nutri-plus/api test`
`pnpm --filter @nutri-plus/web test`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/(app)/layout.tsx apps/web/src/components/onboarding
git commit -m "feat(web): wire tour provider, first-run prompt, and demo-patient cleanup"
```

---

## Self-review (plan vs spec)

| Spec section | Task |
|---|---|
| Hub `/primeiros-passos` + sidebar | 8 |
| 1st-access modal | 8, 10 |
| Click-to-advance engine + driver.js | 7 |
| Replay no PATCH / no progress reset | 7 (test) + 4 (API monotonic) |
| Catalog 9 chapters + IA slice | 6 |
| Diário explanation only, no MealLog seed | 6 (chapter 7 steps) |
| Demo create without invite | 3 |
| `isDemo` badge (anchors in list/detail — add `Badge` **Demo** next to name when `patient.isDemo` in Task 9 list/detail) | 3 + 9 |
| Progress API GET/PATCH + dismiss | 4 |
| Fake-data fixtures | 6, 9 |
| IA lock via entitlements quota/read-only | 6, 8 |
| Employee sees hub, cannot start Pacientes | 7, 8 |
| Delete demo (spec said existing delete — **does not exist**; demo-only DELETE) | 3, 5, 10 |
| Timeout âncora | 7 |
| No Agenda/Pro tours, no billing gate change | Global constraints |
| Tests API+web, no Playwright | 3, 4, 6, 7, 8, 10 |

**Demo badge:** in Task 9 `patients-list.tsx` / `patient-detail.tsx`, when `isDemo`, render shadcn `Badge` with text `Demo`. Add one list test: `isDemo: true` → `Demo` visible.

**Replay cadastro intercept:** Task 7 (engine) + Task 9 (`demo: true` only in play).
