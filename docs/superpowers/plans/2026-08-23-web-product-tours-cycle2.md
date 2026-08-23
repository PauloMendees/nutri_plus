# Web Product Tours — Ciclo 2 (Agenda, Contabilidade, Alimentos, Configurações) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the cycle-1 tour engine (hardcoded to `'patients'`) and ship 4 new tours in the `/primeiros-passos` hub: Agenda (creates a real demo appointment), Contabilidade (creates a real demo transaction), Alimentos (read-only search), Configurações (explanation only).

**Architecture:** The engine stays client-owned (catalog/session/fixtures in the web app; opaque progress rows in the API). Generalization = tour registry `ALL_TOURS` + per-tour `canStart(role)` + catalog-declared `createsDemo` chapters (replaces the scattered `cadastro` special cases). Two new nullable FK columns on `OnboardingProgress` (`demoAppointmentId`, `demoTransactionId`, `onDelete: SetNull`) track demo entities; cleanup banners reuse the existing appointment/transaction DELETEs.

**Tech Stack:** NestJS + Prisma (API), Next.js App Router + Vitest + react-hook-form + driver.js (web), `@nutri-plus/shared-types`. **No new npm dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-23-web-product-tours-cycle2-design.md`

## Global Constraints

- Stay on `feat/web-onboarding-tours-2`. Do not push/PR unless asked. Never commit `.env`.
- Additive Prisma migration only (`pnpm --filter @nutri-plus/api db:migrate --name onboarding_demo_refs`). After schema change: `pnpm --filter @nutri-plus/api prisma:generate`.
- API files: single quotes. Web: match the quote style of the file you edit (agenda components use double quotes; accounting/foods/settings/onboarding lib use single quotes).
- pt-BR copy verbatim from this plan (tour titles, summaries, step titles/bodies, banner texts, locked texts).
- Replay sessions never call PATCH. `COMPLETED`/`SKIPPED` never recede. Monotonic API rules unchanged.
- Do not change `OnboardingGate` (billing), RBAC helpers in `lib/auth/access.ts`, the first-run dialog/host, or `PatientsService.deleteDemoPatient` (it already deletes linked appointments — verified).
- Anchor selectors must match the catalog strings exactly (`[data-tour="..."]`).
- Verify: `pnpm --filter @nutri-plus/shared-types build`; `pnpm --filter @nutri-plus/api test`; `pnpm --filter @nutri-plus/web test`. Keep existing suites green.
- API tests: Jest. Web tests: Vitest.

## File structure

| File | Responsibility |
|---|---|
| `packages/shared-types/src/v1/onboarding.ts` | 5 tour ids; `demoAppointmentId`/`demoTransactionId` in view + patch |
| `apps/api/prisma/schema.prisma` + migration | 2 FK columns on `OnboardingProgress`; back-relations |
| `apps/api/src/onboarding/dto/patch-tour.dto.ts` | 2 optional string fields |
| `apps/api/src/onboarding/onboarding.service.ts` | Persist/expose the new refs |
| `apps/web/src/lib/onboarding/catalog.ts` | `DemoKind`, `canStart`, `createsDemo`, `ALL_TOURS`, 4 new tours |
| `apps/web/src/lib/onboarding/progress.ts` | `demoRefOf`, `isDemoPlayRecovery`, `playRecoveryChapterId` (replaces `isCadastroPlayRecovery`) |
| `apps/web/src/components/onboarding/tour-provider.tsx` | Multi-tour sessions, per-tour gate, generic replay intercept, ref PATCH |
| `apps/web/src/components/onboarding/hub-view.tsx` | N tour cards via `ALL_TOURS.map` |
| `apps/web/src/components/onboarding/delete-demo-banner.tsx` | Generic `DemoCleanupBanner` + appointment/transaction banners |
| `apps/web/src/components/agenda/*` | Anchors, fixture `appointment`, notify with `demoAppointmentId` |
| `apps/web/src/components/accounting/*` | Anchors, fixture `transaction`, notify with `demoTransactionId` |
| `apps/web/src/components/foods/foods-browse.tsx` | Anchors + fixture `foods-search` |
| `apps/web/src/components/settings/settings-view.tsx` | Anchors only (nothing saved) |

---

### Task 1: shared-types — 5 tour ids + demo ref fields

**Files:**
- Modify: `packages/shared-types/src/v1/onboarding.ts`
- Test: `apps/api/src/onboarding/onboarding.types.spec.ts` (existing — update)

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - `ONBOARDING_TOUR_IDS = ['patients', 'agenda', 'contabilidade', 'alimentos', 'configuracoes'] as const`
  - `OnboardingTourProgressView.demoAppointmentId: string | null` and `.demoTransactionId: string | null`
  - `PatchOnboardingTourRequest.demoAppointmentId?: string | null` and `.demoTransactionId?: string | null`

- [ ] **Step 1: Update the types smoke test to the new contract (failing first)**

In `apps/api/src/onboarding/onboarding.types.spec.ts`:

Replace the first assertion:

```ts
it('exposes the five cycle-2 tours in sidebar order', () => {
  expect(ONBOARDING_TOUR_IDS).toEqual([
    'patients',
    'agenda',
    'contabilidade',
    'alimentos',
    'configuracoes',
  ]);
});
```

In the `OnboardingMeView` literal of the second test, add the two new required fields to the tour object (next to `demoPatientId: 'p1'`):

```ts
demoAppointmentId: null,
demoTransactionId: null,
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/api test onboarding.types`
Expected: FAIL (array mismatch; unknown properties under ts-jest).

- [ ] **Step 3: Update the types**

In `packages/shared-types/src/v1/onboarding.ts`:

```ts
export const ONBOARDING_TOUR_IDS = [
  'patients',
  'agenda',
  'contabilidade',
  'alimentos',
  'configuracoes',
] as const;
```

In `OnboardingTourProgressView`, after `demoPatientId`:

```ts
demoAppointmentId: string | null;
demoTransactionId: string | null;
```

In `PatchOnboardingTourRequest`, after `demoPatientId`:

```ts
demoAppointmentId?: string | null;
demoTransactionId?: string | null;
```

- [ ] **Step 4: Build and re-run**

Run: `pnpm --filter @nutri-plus/shared-types build && pnpm --filter @nutri-plus/api test onboarding.types`
Expected: PASS. (Other API/web suites are untouched at this point — the new view fields only break code that constructs the view, fixed in Tasks 3/5/6.)

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/v1/onboarding.ts apps/api/src/onboarding/onboarding.types.spec.ts
git commit -m "feat(types): cycle-2 tour ids and demo appointment/transaction refs"
```

---

### Task 2: Prisma — demo ref columns

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`OnboardingProgress`, `Appointment`, `Transaction`)
- Create: migration via CLI

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma client fields `onboardingProgress.demoAppointmentId` / `.demoTransactionId` (both `String?`, `SetNull` on entity delete).

- [ ] **Step 1: Edit the schema (no test — the migration is the deliverable)**

In `model OnboardingProgress`, after the `demoPatient` relation line:

```prisma
demoAppointmentId String?
demoAppointment   Appointment? @relation(fields: [demoAppointmentId], references: [id], onDelete: SetNull)
demoTransactionId String?
demoTransaction   Transaction? @relation(fields: [demoTransactionId], references: [id], onDelete: SetNull)
```

In `model Appointment` (after `appointmentReminderSentAt`) and in `model Transaction` (after `description`), add the back-relation:

```prisma
onboardingDemoFor OnboardingProgress[]
```

- [ ] **Step 2: Migrate and generate**

Run: `pnpm --filter @nutri-plus/api db:migrate --name onboarding_demo_refs`
Then: `pnpm --filter @nutri-plus/api prisma:generate`
Expected: migration SQL adds the two nullable columns + FKs; client exposes the new fields.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): onboarding demo appointment/transaction pointers"
```

---

### Task 3: API — persist and expose the new refs

**Files:**
- Modify: `apps/api/src/onboarding/dto/patch-tour.dto.ts`
- Modify: `apps/api/src/onboarding/onboarding.service.ts`
- Test: `apps/api/src/onboarding/onboarding.service.spec.ts` (extend)

**Interfaces:**
- Consumes: Task 1 types; Task 2 Prisma fields.
- Produces:
  - `PATCH /v1/me/onboarding/:tourId` accepts `demoAppointmentId?: string | null`, `demoTransactionId?: string | null` (same semantics as `demoPatientId`).
  - `GET /v1/me/onboarding` exposes both on every tour row.
  - `tourId: 'agenda' | 'contabilidade' | 'alimentos' | 'configuracoes'` now pass `isOnboardingTourId` (no controller change needed).

- [ ] **Step 1: Write the failing tests** (append inside `describe('OnboardingService')` in `onboarding.service.spec.ts`, following the file's existing `mockDeep<PrismaService>` style)

```ts
it('accepts the agenda tour and upserts demoAppointmentId on first write', async () => {
  prisma.onboardingProgress.findUnique.mockResolvedValue(null);
  prisma.onboardingProgress.upsert.mockResolvedValue({
    id: 'pr2', status: 'IN_PROGRESS', tourId: 'agenda',
    demoPatientId: null, demoAppointmentId: 'apt-1', demoTransactionId: null,
    completedAt: null, chapters: [],
  } as any);
  prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: null } as any);
  prisma.onboardingProgress.findMany.mockResolvedValue([]);

  await svc.patchTour('u1', 'agenda', { demoAppointmentId: 'apt-1' });

  expect(prisma.onboardingProgress.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId_tourId: { userId: 'u1', tourId: 'agenda' } },
      create: expect.objectContaining({ tourId: 'agenda', demoAppointmentId: 'apt-1' }),
    }),
  );
});

it('updates demoTransactionId on an existing contabilidade row', async () => {
  prisma.onboardingProgress.findUnique.mockResolvedValue({
    id: 'pr3', status: 'IN_PROGRESS', tourId: 'contabilidade',
    demoPatientId: null, demoAppointmentId: null, demoTransactionId: null,
    completedAt: null, chapters: [],
  } as any);
  prisma.onboardingProgress.update.mockResolvedValue({} as any);
  prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: null } as any);
  prisma.onboardingProgress.findMany.mockResolvedValue([]);

  await svc.patchTour('u1', 'contabilidade', { demoTransactionId: 'tx-1' });

  expect(prisma.onboardingProgress.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 'pr3' },
      data: expect.objectContaining({ demoTransactionId: 'tx-1' }),
    }),
  );
});

it('exposes demoAppointmentId and demoTransactionId in the view', async () => {
  prisma.user.findUniqueOrThrow.mockResolvedValue({ onboardingPromptDismissedAt: null } as any);
  prisma.onboardingProgress.findMany.mockResolvedValue([
    {
      id: 'pr2', tourId: 'agenda', status: 'IN_PROGRESS',
      demoPatientId: null, demoAppointmentId: 'apt-1', demoTransactionId: null,
      completedAt: null, chapters: [],
    },
  ] as any);
  const out = await svc.getMine('u1');
  expect(out.tours[0]).toMatchObject({
    tourId: 'agenda',
    demoAppointmentId: 'apt-1',
    demoTransactionId: null,
  });
});

it('still rejects an unknown tourId', async () => {
  await expect(svc.patchTour('u1', 'funcionarios', { chapterId: 'x' })).rejects.toBeInstanceOf(
    BadRequestException,
  );
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @nutri-plus/api test onboarding.service.spec`
Expected: FAIL (`demoAppointmentId` not written/exposed; `agenda` previously rejected fails differently now — the first test fails on the upsert payload).

- [ ] **Step 3: Implement**

`dto/patch-tour.dto.ts` — after `demoPatientId`:

```ts
@IsOptional()
@IsString()
demoAppointmentId?: string | null;

@IsOptional()
@IsString()
demoTransactionId?: string | null;
```

`onboarding.service.ts` — four spots:

1. COMPLETED-tour branch (currently only updates `demoPatientId`): replace the single-field check with

```ts
const refData: {
  demoPatientId?: string | null;
  demoAppointmentId?: string | null;
  demoTransactionId?: string | null;
} = {};
if (dto.demoPatientId !== undefined && progress.demoPatientId !== dto.demoPatientId) {
  refData.demoPatientId = dto.demoPatientId;
}
if (dto.demoAppointmentId !== undefined && progress.demoAppointmentId !== dto.demoAppointmentId) {
  refData.demoAppointmentId = dto.demoAppointmentId;
}
if (dto.demoTransactionId !== undefined && progress.demoTransactionId !== dto.demoTransactionId) {
  refData.demoTransactionId = dto.demoTransactionId;
}
if (Object.keys(refData).length > 0) {
  await this.prisma.onboardingProgress.update({ where: { id: progress.id }, data: refData });
}
```

2. `hasWrite` (missing-row branch):

```ts
const hasWrite =
  !!dto.chapterId ||
  dto.demoPatientId !== undefined ||
  dto.demoAppointmentId !== undefined ||
  dto.demoTransactionId !== undefined ||
  dto.tourStatus === 'COMPLETED';
```

3. Upsert `create` gains:

```ts
demoAppointmentId: dto.demoAppointmentId ?? undefined,
demoTransactionId: dto.demoTransactionId ?? undefined,
```

4. `existed` branch `data` object: widen its type with the two new optional fields and add

```ts
if (dto.demoAppointmentId !== undefined) data.demoAppointmentId = dto.demoAppointmentId;
if (dto.demoTransactionId !== undefined) data.demoTransactionId = dto.demoTransactionId;
```

5. `toView` tour mapping gains:

```ts
demoAppointmentId: tour.demoAppointmentId,
demoTransactionId: tour.demoTransactionId,
```

- [ ] **Step 4: Run the API onboarding suites**

Run: `pnpm --filter @nutri-plus/api test onboarding`
Expected: PASS (types + service specs, monotonic tests still green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/onboarding
git commit -m "feat(api): onboarding demo refs for agenda and contabilidade tours"
```

---

### Task 4: Web catalog + progress — registry, gates, 4 new tours

**Files:**
- Modify: `apps/web/src/lib/onboarding/catalog.ts`
- Modify: `apps/web/src/lib/onboarding/progress.ts`
- Create: `apps/web/src/lib/onboarding/catalog.test.ts`
- Modify: `apps/web/src/lib/onboarding/progress.test.ts`

**Interfaces:**
- Consumes: `OnboardingTourId`, `OnboardingTourProgressView` (Task 1), `UserRole`, `canManagePatients`/`canBrowseFoods`/`canManageSettings` from `@/lib/auth/access`.
- Produces (lock these names — Tasks 5/6 use them):

```ts
export type DemoKind = 'patient' | 'appointment' | 'transaction';
// TourChapter gains: createsDemo?: DemoKind
// TourDefinition becomes:
export type TourDefinition = {
  id: OnboardingTourId;
  title: string;
  summary: string;
  canStart: (role: UserRole) => boolean;
  startLockedText?: string;
  chapters: TourChapter[];
};
export const AGENDA_TOUR: TourDefinition;
export const CONTABILIDADE_TOUR: TourDefinition;
export const ALIMENTOS_TOUR: TourDefinition;
export const CONFIGURACOES_TOUR: TourDefinition;
export const ALL_TOURS: TourDefinition[]; // [PATIENTS_TOUR, AGENDA_TOUR, CONTABILIDADE_TOUR, ALIMENTOS_TOUR, CONFIGURACOES_TOUR]
export function getTour(id: string): TourDefinition | undefined; // ALL_TOURS lookup

// progress.ts:
export function demoRefOf(tour: OnboardingTourProgressView | undefined, kind: DemoKind): string | null;
export function isDemoPlayRecovery(def: TourDefinition, chapter: TourChapter, tour: OnboardingTourProgressView | undefined): boolean;
export function playRecoveryChapterId(def: TourDefinition, tour: OnboardingTourProgressView | undefined): string | null;
// continuePlayChapterId keeps its signature; isCadastroPlayRecovery is DELETED.
```

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/onboarding/catalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { UserRole } from '@nutri-plus/shared-types';
import {
  AGENDA_TOUR,
  ALIMENTOS_TOUR,
  ALL_TOURS,
  CONFIGURACOES_TOUR,
  CONTABILIDADE_TOUR,
  PATIENTS_TOUR,
  getTour,
} from './catalog';

describe('cycle-2 catalog', () => {
  it('registers the five tours in sidebar order', () => {
    expect(ALL_TOURS.map((t) => t.id)).toEqual([
      'patients',
      'agenda',
      'contabilidade',
      'alimentos',
      'configuracoes',
    ]);
    expect(getTour('agenda')).toBe(AGENDA_TOUR);
    expect(getTour('desconhecido')).toBeUndefined();
  });

  it('gates start by module permission', () => {
    expect(PATIENTS_TOUR.canStart(UserRole.EMPLOYEE)).toBe(false);
    expect(AGENDA_TOUR.canStart(UserRole.EMPLOYEE)).toBe(true);
    expect(CONTABILIDADE_TOUR.canStart(UserRole.EMPLOYEE)).toBe(true);
    expect(ALIMENTOS_TOUR.canStart(UserRole.EMPLOYEE)).toBe(false);
    expect(CONFIGURACOES_TOUR.canStart(UserRole.EMPLOYEE)).toBe(false);
    for (const tour of ALL_TOURS) {
      expect(tour.canStart(UserRole.NUTRITIONIST)).toBe(true);
    }
  });

  it('declares chapters and createsDemo per tour', () => {
    expect(AGENDA_TOUR.chapters.map((c) => c.id)).toEqual(['visao-geral', 'agendamento', 'categorias']);
    expect(AGENDA_TOUR.chapters.find((c) => c.id === 'agendamento')?.createsDemo).toBe('appointment');
    expect(CONTABILIDADE_TOUR.chapters.map((c) => c.id)).toEqual(['extrato', 'lancamento', 'categorias']);
    expect(CONTABILIDADE_TOUR.chapters.find((c) => c.id === 'lancamento')?.createsDemo).toBe('transaction');
    expect(ALIMENTOS_TOUR.chapters.map((c) => c.id)).toEqual(['busca']);
    expect(CONFIGURACOES_TOUR.chapters.map((c) => c.id)).toEqual([
      'plano-alimentar',
      'aparencia',
      'aplicativo',
      'assinatura',
    ]);
    expect(PATIENTS_TOUR.chapters.find((c) => c.id === 'cadastro')?.createsDemo).toBe('patient');
  });

  it('only the patients tour has demo-dependent chapters', () => {
    expect(PATIENTS_TOUR.chapters.some((c) => c.requiresDemo)).toBe(true);
    for (const tour of [AGENDA_TOUR, CONTABILIDADE_TOUR, ALIMENTOS_TOUR, CONFIGURACOES_TOUR]) {
      expect(tour.chapters.some((c) => c.requiresDemo)).toBe(false);
    }
  });

  it('every step anchor is a data-tour selector', () => {
    for (const tour of ALL_TOURS) {
      for (const chapter of tour.chapters) {
        for (const step of chapter.steps) {
          expect(step.anchor).toMatch(/^\[data-tour="/);
        }
      }
    }
  });
});
```

In `progress.test.ts`: every existing tour-progress literal needs `demoAppointmentId: null, demoTransactionId: null` added. Replace any `isCadastroPlayRecovery` tests with:

```ts
import { AGENDA_TOUR, PATIENTS_TOUR } from './catalog';
import { demoRefOf, isDemoPlayRecovery, playRecoveryChapterId, continuePlayChapterId } from './progress';

it('recovers cadastro when the demo patient is gone', () => {
  const tour = {
    tourId: 'patients' as const,
    status: 'IN_PROGRESS' as const,
    demoPatientId: null,
    demoAppointmentId: null,
    demoTransactionId: null,
    completedAt: null,
    chapters: [
      { chapterId: 'cadastro', status: 'COMPLETED' as const, furthestStepId: 'submit', completedAt: 'x' },
    ],
  };
  const cadastro = PATIENTS_TOUR.chapters.find((c) => c.id === 'cadastro')!;
  expect(isDemoPlayRecovery(PATIENTS_TOUR, cadastro, tour)).toBe(true);
  expect(playRecoveryChapterId(PATIENTS_TOUR, tour)).toBe('cadastro');
});

it('does not recover agenda when the demo appointment is gone (nothing depends on it)', () => {
  const tour = {
    tourId: 'agenda' as const,
    status: 'COMPLETED' as const,
    demoPatientId: null,
    demoAppointmentId: null,
    demoTransactionId: null,
    completedAt: 'x',
    chapters: [
      { chapterId: 'agendamento', status: 'COMPLETED' as const, furthestStepId: 'save', completedAt: 'x' },
    ],
  };
  expect(playRecoveryChapterId(AGENDA_TOUR, tour)).toBeNull();
});

it('demoRefOf maps kinds to the right pointer', () => {
  const tour = {
    tourId: 'agenda' as const,
    status: 'IN_PROGRESS' as const,
    demoPatientId: 'p1',
    demoAppointmentId: 'apt-1',
    demoTransactionId: 'tx-1',
    completedAt: null,
    chapters: [],
  };
  expect(demoRefOf(tour, 'patient')).toBe('p1');
  expect(demoRefOf(tour, 'appointment')).toBe('apt-1');
  expect(demoRefOf(tour, 'transaction')).toBe('tx-1');
  expect(demoRefOf(undefined, 'appointment')).toBeNull();
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @nutri-plus/web test src/lib/onboarding`
Expected: FAIL (missing exports).

- [ ] **Step 3: Implement `catalog.ts`**

Type changes at the top of the file:

```ts
import type { OnboardingTourId } from '@nutri-plus/shared-types';
import { UserRole } from '@nutri-plus/shared-types';
import { canBrowseFoods, canManagePatients, canManageSettings } from '@/lib/auth/access';

export type DemoKind = 'patient' | 'appointment' | 'transaction';
```

Add to `TourChapter`:

```ts
createsDemo?: DemoKind;
```

Replace `TourDefinition`:

```ts
export type TourDefinition = {
  id: OnboardingTourId;
  title: string;
  summary: string;
  canStart: (role: UserRole) => boolean;
  startLockedText?: string;
  chapters: TourChapter[];
};
```

On `PATIENTS_TOUR` add:

```ts
canStart: canManagePatients,
startLockedText: 'Este tutorial é feito pelo nutricionista (cadastro de pacientes).',
```

and on its `cadastro` chapter add `createsDemo: 'patient',`.

Append the four new tours (bodies verbatim):

```ts
export const AGENDA_TOUR: TourDefinition = {
  id: 'agenda',
  title: 'Agenda',
  summary: 'Agendamentos, visões de mês e lista, e categorias.',
  canStart: () => true,
  chapters: [
    {
      id: 'visao-geral',
      title: 'Visão geral',
      steps: [
        {
          id: 'view',
          route: '/agenda',
          anchor: '[data-tour="agenda.view"]',
          title: 'Sua agenda',
          body: 'Veja os atendimentos do mês ou em lista. Tudo começa aqui.',
          advance: 'next',
        },
        {
          id: 'toggle',
          route: '/agenda',
          anchor: '[data-tour="agenda.toggle"]',
          title: 'Mês ou lista',
          body: 'Alterne entre a grade do mês e a lista de atendimentos.',
          advance: 'next',
        },
        {
          id: 'nav',
          route: '/agenda',
          anchor: '[data-tour="agenda.nav"]',
          title: 'Navegação',
          body: 'Avance ou volte meses e retorne a hoje com um clique.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'agendamento',
      title: 'Agendamento',
      createsDemo: 'appointment',
      steps: [
        {
          id: 'new',
          route: '/agenda',
          anchor: '[data-tour="agenda.new"]',
          title: 'Novo agendamento',
          body: 'Clique para abrir o formulário. O tour cria um agendamento de demonstração.',
          advance: 'click',
        },
        {
          id: 'form',
          route: '/agenda',
          anchor: '[data-tour="agenda.form"]',
          title: 'Formulário',
          body: 'A categoria preenche o título e o paciente é opcional. Use dados fictícios se quiser.',
          advance: 'next',
          fixture: 'appointment',
        },
        {
          id: 'save',
          route: '/agenda',
          anchor: '[data-tour="agenda.save"]',
          title: 'Salvar agendamento',
          body: 'Salve para criar o agendamento de demonstração.',
          advance: 'click',
          awaitAction: true,
        },
      ],
    },
    {
      id: 'categorias',
      title: 'Categorias',
      steps: [
        {
          id: 'list',
          route: '/agenda/categorias',
          anchor: '[data-tour="agenda.categories"]',
          title: 'Categorias',
          body: 'Organize os tipos de atendimento. A categoria padrão vem pré-selecionada.',
          advance: 'next',
        },
        {
          id: 'new',
          route: '/agenda/categorias',
          anchor: '[data-tour="agenda.category.new"]',
          title: 'Nova categoria',
          body: 'Abra o formulário de categoria. Nada será salvo neste passo.',
          advance: 'click',
        },
        {
          id: 'form',
          route: '/agenda/categorias',
          anchor: '[data-tour="agenda.category.form"]',
          title: 'Cor e padrão',
          body: 'Escolha uma cor e marque como padrão se quiser pré-selecionar.',
          advance: 'next',
        },
        {
          id: 'cancel',
          route: '/agenda/categorias',
          anchor: '[data-tour="agenda.category.cancel"]',
          title: 'Fechar sem salvar',
          body: 'Clique em Cancelar para fechar. O tour não cria categoria.',
          advance: 'click',
        },
      ],
    },
  ],
};

export const CONTABILIDADE_TOUR: TourDefinition = {
  id: 'contabilidade',
  title: 'Contabilidade',
  summary: 'Extrato mensal, lançamentos e categorias financeiras.',
  canStart: () => true,
  chapters: [
    {
      id: 'extrato',
      title: 'Extrato',
      steps: [
        {
          id: 'view',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.view"]',
          title: 'Seu extrato',
          body: 'Receitas e despesas do mês, com saldo acumulado.',
          advance: 'next',
        },
        {
          id: 'chart',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.chart"]',
          title: 'Entradas x Saídas',
          body: 'O gráfico compara os últimos 12 meses.',
          advance: 'next',
        },
        {
          id: 'cards',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.cards"]',
          title: 'Resumo do mês',
          body: 'Entradas, saídas e saldo do mês selecionado.',
          advance: 'next',
        },
        {
          id: 'nav',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.nav"]',
          title: 'Troca de mês',
          body: 'Navegue entre os meses do extrato.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'lancamento',
      title: 'Lançamento',
      createsDemo: 'transaction',
      steps: [
        {
          id: 'new',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.new"]',
          title: 'Nova transação',
          body: 'Clique para registrar. O tour cria um lançamento de demonstração.',
          advance: 'click',
        },
        {
          id: 'form',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.form"]',
          title: 'Formulário',
          body: 'O tipo filtra as categorias e o valor é em reais. Use dados fictícios se quiser.',
          advance: 'next',
          fixture: 'transaction',
        },
        {
          id: 'save',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.save"]',
          title: 'Salvar lançamento',
          body: 'Salve para registrar o lançamento de demonstração.',
          advance: 'click',
          awaitAction: true,
        },
        {
          id: 'table',
          route: '/contabilidade',
          anchor: '[data-tour="contabilidade.table"]',
          title: 'No extrato',
          body: 'O lançamento aparece na tabela. Clique numa linha para editar.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'categorias',
      title: 'Categorias',
      steps: [
        {
          id: 'list',
          route: '/contabilidade/categorias',
          anchor: '[data-tour="contabilidade.categories"]',
          title: 'Categorias',
          body: 'Separe receitas e despesas por categoria.',
          advance: 'next',
        },
        {
          id: 'new',
          route: '/contabilidade/categorias',
          anchor: '[data-tour="contabilidade.category.new"]',
          title: 'Nova categoria',
          body: 'Abra o formulário de categoria. Nada será salvo neste passo.',
          advance: 'click',
        },
        {
          id: 'form',
          route: '/contabilidade/categorias',
          anchor: '[data-tour="contabilidade.category.form"]',
          title: 'Nome e tipo',
          body: 'Defina o nome e se é receita ou despesa.',
          advance: 'next',
        },
        {
          id: 'cancel',
          route: '/contabilidade/categorias',
          anchor: '[data-tour="contabilidade.category.cancel"]',
          title: 'Fechar sem salvar',
          body: 'Clique em Cancelar para fechar. O tour não cria categoria.',
          advance: 'click',
        },
      ],
    },
  ],
};

export const ALIMENTOS_TOUR: TourDefinition = {
  id: 'alimentos',
  title: 'Alimentos',
  summary: 'Busca na tabela TACO com dados nutricionais.',
  canStart: canBrowseFoods,
  startLockedText: 'Este tutorial é feito pelo nutricionista (busca de alimentos).',
  chapters: [
    {
      id: 'busca',
      title: 'Busca',
      steps: [
        {
          id: 'search',
          route: '/alimentos',
          anchor: '[data-tour="alimentos.search"]',
          title: 'Busca TACO',
          body: 'Digite ao menos 2 letras — ou use os dados fictícios para buscar "arroz".',
          advance: 'next',
          fixture: 'foods-search',
        },
        {
          id: 'table',
          route: '/alimentos',
          anchor: '[data-tour="alimentos.table"]',
          title: 'Valores por 100 g',
          body: 'Energia, macros, fibra e sódio de cada alimento.',
          advance: 'next',
        },
      ],
    },
  ],
};

export const CONFIGURACOES_TOUR: TourDefinition = {
  id: 'configuracoes',
  title: 'Configurações',
  summary: 'Plano alimentar, aparência, aplicativo do paciente e assinatura.',
  canStart: canManageSettings,
  startLockedText: 'Este tutorial é feito pelo nutricionista (configurações da conta).',
  chapters: [
    {
      id: 'plano-alimentar',
      title: 'Plano alimentar',
      steps: [
        {
          id: 'tabs',
          route: '/configuracoes',
          anchor: '[data-tour="config.tabs"]',
          title: 'As 4 áreas',
          body: 'Plano alimentar, aparência, aplicativo do paciente e assinatura.',
          advance: 'next',
        },
        {
          id: 'plano',
          route: '/configuracoes',
          anchor: '[data-tour="config.plano"]',
          title: 'PDF do plano',
          body: 'Logomarca, nome de exibição e instruções padrão da IA. Nada é salvo no tour.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'aparencia',
      title: 'Aparência',
      steps: [
        {
          id: 'tab',
          route: '/configuracoes',
          anchor: '[data-tour="config.tab.aparencia"]',
          title: 'Aba Aparência',
          body: 'Abra a aba de aparência.',
          advance: 'click',
        },
        {
          id: 'theme',
          route: '/configuracoes',
          anchor: '[data-tour="config.aparencia"]',
          title: 'Tema',
          body: 'Escolha entre tema claro e escuro.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'aplicativo',
      title: 'Aplicativo Paciente',
      steps: [
        {
          id: 'tab',
          route: '/configuracoes',
          anchor: '[data-tour="config.tab.app"]',
          title: 'Aba Aplicativo',
          body: 'Abra as configurações do app do paciente.',
          advance: 'click',
        },
        {
          id: 'content',
          route: '/configuracoes',
          anchor: '[data-tour="config.app"]',
          title: 'Padrões do app',
          body: 'WhatsApp de contato e permissões padrão para novos pacientes. Nada é salvo no tour.',
          advance: 'next',
        },
      ],
    },
    {
      id: 'assinatura',
      title: 'Assinatura',
      steps: [
        {
          id: 'tab',
          route: '/configuracoes',
          anchor: '[data-tour="config.tab.assinatura"]',
          title: 'Aba Assinatura',
          body: 'Abra os dados da assinatura.',
          advance: 'click',
        },
        {
          id: 'content',
          route: '/configuracoes',
          anchor: '[data-tour="config.assinatura"]',
          title: 'Seu plano',
          body: 'Plano atual, forma de pagamento e faturas.',
          advance: 'next',
        },
      ],
    },
  ],
};

export const ALL_TOURS: TourDefinition[] = [
  PATIENTS_TOUR,
  AGENDA_TOUR,
  CONTABILIDADE_TOUR,
  ALIMENTOS_TOUR,
  CONFIGURACOES_TOUR,
];

export function getTour(id: string): TourDefinition | undefined {
  return ALL_TOURS.find((tour) => tour.id === id);
}
```

(`TourRouteCtx` stays `{ demoPatientId: string; pathname?: string }` — only the patients tour uses function routes and `resolveRoute` already guards the missing ref.)

**Implement `progress.ts`:** delete `isCadastroPlayRecovery` and add (keeping existing imports plus `DemoKind`):

```ts
export function demoRefOf(
  tour: OnboardingTourProgressView | undefined,
  kind: DemoKind,
): string | null {
  if (!tour) return null;
  if (kind === 'patient') return tour.demoPatientId;
  if (kind === 'appointment') return tour.demoAppointmentId;
  return tour.demoTransactionId;
}

/** A createsDemo chapter is terminal but its entity is gone — and other
 * chapters of this tour depend on that entity: play it again to recreate. */
export function isDemoPlayRecovery(
  def: TourDefinition,
  chapter: TourChapter,
  tour: OnboardingTourProgressView | undefined,
): boolean {
  if (!chapter.createsDemo) return false;
  if (!def.chapters.some((c) => c.requiresDemo)) return false;
  if (demoRefOf(tour, chapter.createsDemo)) return false;
  const row = tour?.chapters?.find((c) => c.chapterId === chapter.id);
  return row?.status === 'COMPLETED' || row?.status === 'SKIPPED';
}

export function playRecoveryChapterId(
  def: TourDefinition,
  tour: OnboardingTourProgressView | undefined,
): string | null {
  return def.chapters.find((chapter) => isDemoPlayRecovery(def, chapter, tour))?.id ?? null;
}

export function continuePlayChapterId(
  def: TourDefinition,
  tour: OnboardingTourProgressView | undefined,
  entitlements: Entitlements | undefined,
): string | null {
  return firstIncompleteChapterId(def, tour, entitlements) ?? playRecoveryChapterId(def, tour);
}
```

Note: `tour-provider.tsx` and `hub-view.tsx` still import `isCadastroPlayRecovery` at this point — they are fixed in Tasks 5 and 6. To keep this task's suite green without touching them yet, run only the lib folder in Step 4 (the component suites are re-run at Tasks 5/6).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @nutri-plus/web test src/lib/onboarding`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/onboarding
git commit -m "feat(web): multi-tour catalog with per-tour gates and demo recovery helpers"
```

---

### Task 5: TourProvider — multi-tour engine

**Files:**
- Modify: `apps/web/src/components/onboarding/tour-provider.tsx`
- Modify: `apps/web/src/components/patients/create-patient-form.tsx` (rename call sites)
- Modify: `apps/web/src/components/onboarding/tour-provider.test.tsx`
- Check: `grep -rn "isPlayCadastroSubmit" apps/web/src` — update every hit (Probe, form, any test mock).

**Interfaces:**
- Consumes: Task 4 (`getTour`, `ALL_TOURS` semantics, `isDemoPlayRecovery`, `DemoKind`), Task 1 (`OnboardingTourId`).
- Produces (Tasks 6–9 use):

```ts
export type DemoRefPayload = {
  demoPatientId?: string;
  demoAppointmentId?: string;
  demoTransactionId?: string;
};
export type TourApi = {
  start(opts: { tourId: OnboardingTourId; chapterId: string; replay: boolean }): void;
  exit(): void;
  skipChapter(): void;
  isPlayDemoSubmit(kind: DemoKind): boolean; // replaces isPlayCadastroSubmit
  notifyChapterActionSucceeded(opts?: DemoRefPayload): Promise<boolean>;
};
```

Behavior contract:
- `start`/URL hydration for tour X requires `getTour(X)?.canStart(role)`; the three global `role === EMPLOYEE` blocks are removed.
- Every PATCH targets `session.tourId` (no more literal `'patients'`).
- Replay + chapter with `createsDemo` + `awaitAction` step: `preventDefault` + `stopPropagation`; kind `'patient'` pushes `/patients/{demoPatientId}`; kinds `'appointment'`/`'transaction'` dispatch an Escape keydown on `document` (closes the Radix dialog); then advance. Zero PATCH.
- `notifyChapterActionSucceeded` with a ref payload only acts when the current chapter's `createsDemo` matches the payload kind. On a non-last `awaitAction` step it PATCHes the ref alone (play only) and advances; on the last step it hands the refs to `finishChapter` (existing behavior).

- [ ] **Step 1: Write/adjust the failing tests**

In `tour-provider.test.tsx`:

1. Rename the two `isPlayCadastroSubmit()` usages in `Probe`/`Outside` to `isPlayDemoSubmit('patient')` (keep `data-testid="play-cadastro"` so existing assertions stand).
2. Add buttons and anchors to `Probe`:

```tsx
<button type="button" onClick={() => tour.start({ tourId: 'agenda', chapterId: 'visao-geral', replay: false })}>
  start-agenda
</button>
<button type="button" onClick={() => tour.start({ tourId: 'agenda', chapterId: 'agendamento', replay: true })}>
  start-replay-agendamento
</button>
<button type="button" onClick={() => tour.start({ tourId: 'contabilidade', chapterId: 'lancamento', replay: false })}>
  start-lancamento
</button>
<button type="button" onClick={() => tour.start({ tourId: 'configuracoes', chapterId: 'plano-alimentar', replay: false })}>
  start-configuracoes
</button>
<button
  type="button"
  onClick={() => {
    void tour.notifyChapterActionSucceeded({ demoTransactionId: 'tx-1' });
  }}
>
  notify-transaction
</button>
<h2 data-tour="agenda.view">Agenda</h2>
<div data-tour="agenda.toggle">toggle</div>
<div data-tour="agenda.nav">nav</div>
<button type="button" data-tour="agenda.new">Novo agendamento</button>
<form
  data-tour="agenda.form"
  onSubmit={(event) => {
    event.preventDefault();
    nativeSubmit();
  }}
>
  <button type="submit" data-tour="agenda.save">Salvar agendamento</button>
</form>
<button type="button" data-tour="contabilidade.new">Nova transação</button>
<form
  data-tour="contabilidade.form"
  onSubmit={(event) => {
    event.preventDefault();
    nativeSubmit();
  }}
>
  <button type="submit" data-tour="contabilidade.save">Salvar lançamento</button>
</form>
<div data-tour="contabilidade.table">extrato</div>
```

3. In the `onboardingState` inline type, add `demoAppointmentId?: string | null; demoTransactionId?: string | null;` to the tour row shape (loose object — existing literals keep working).
4. New test cases (`pathname = '/agenda'` / `'/contabilidade'` where noted):

```ts
it('starts the agenda tour and patches the agenda tourId', () => {
  pathname = '/agenda';
  renderTour();
  fireEvent.click(screen.getByText('start-agenda'));
  expect(patch).toHaveBeenCalledWith(
    'agenda',
    expect.objectContaining({ chapterId: 'visao-geral', chapterStatus: 'IN_PROGRESS' }),
  );
});

it('EMPLOYEE starts agenda but not configuracoes or patients', () => {
  pathname = '/agenda';
  renderTour(UserRole.EMPLOYEE);
  fireEvent.click(screen.getByText('start-configuracoes'));
  expect(patch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('start-play'));
  expect(patch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('start-agenda'));
  expect(patch).toHaveBeenCalledWith(
    'agenda',
    expect.objectContaining({ chapterId: 'visao-geral', chapterStatus: 'IN_PROGRESS' }),
  );
});

it('replay of the agendamento save step does not native-submit and does not patch', async () => {
  pathname = '/agenda';
  onboardingState.data = {
    promptDismissedAt: null,
    tours: [
      {
        tourId: 'agenda',
        demoPatientId: null,
        demoAppointmentId: 'apt-1',
        demoTransactionId: null,
        chapters: [{ chapterId: 'agendamento', status: 'COMPLETED', furthestStepId: 'save', completedAt: 'x' }],
      },
    ],
  };
  renderTour();
  fireEvent.click(screen.getByText('start-replay-agendamento'));
  expect(await screen.findByRole('dialog', { name: 'Novo agendamento' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Novo agendamento' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Próximo' }));
  expect(await screen.findByRole('dialog', { name: 'Salvar agendamento' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Salvar agendamento' }));
  expect(nativeSubmit).not.toHaveBeenCalled();
  expect(patch).not.toHaveBeenCalled();
});

it('lancamento notify patches the transaction ref and advances to the table step', async () => {
  pathname = '/contabilidade';
  renderTour();
  fireEvent.click(screen.getByText('start-lancamento'));
  expect(await screen.findByRole('dialog', { name: 'Nova transação' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Nova transação' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Próximo' }));
  expect(await screen.findByRole('dialog', { name: 'Salvar lançamento' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('notify-transaction'));
  await waitFor(() => {
    expect(patch).toHaveBeenCalledWith(
      'contabilidade',
      expect.objectContaining({ demoTransactionId: 'tx-1' }),
    );
  });
  expect(await screen.findByRole('dialog', { name: 'No extrato' })).toBeInTheDocument();
  expect(patch).not.toHaveBeenCalledWith(
    'contabilidade',
    expect.objectContaining({ chapterId: 'lancamento', chapterStatus: 'COMPLETED' }),
  );
});

it('notify with a mismatched demo ref kind is ignored', async () => {
  renderTour();
  fireEvent.click(screen.getByText('start-cadastro-play'));
  fireEvent.click(await screen.findByRole('button', { name: 'Próximo' }));
  expect(await screen.findByRole('dialog', { name: 'Salvar cadastro' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('notify-transaction'));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(patch).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ demoTransactionId: 'tx-1' }));
  expect(screen.getByRole('dialog', { name: 'Salvar cadastro' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @nutri-plus/web test tour-provider`
Expected: FAIL (new API names / behaviors missing).

- [ ] **Step 3: Implement the provider changes**

Point-by-point edits to `tour-provider.tsx`:

1. **Imports/types.** Import `type OnboardingTourId` from shared-types; `type DemoKind` from catalog; replace `isCadastroPlayRecovery` import with `isDemoPlayRecovery` from progress. Replace types:

```ts
type Session = { tourId: OnboardingTourId; chapterId: string; stepIndex: number; mode: Mode };

export type DemoRefPayload = {
  demoPatientId?: string;
  demoAppointmentId?: string;
  demoTransactionId?: string;
};

export type TourApi = {
  start(opts: { tourId: OnboardingTourId; chapterId: string; replay: boolean }): void;
  exit(): void;
  skipChapter(): void;
  isPlayDemoSubmit(kind: DemoKind): boolean;
  notifyChapterActionSucceeded(opts?: DemoRefPayload): Promise<boolean>;
};
```

`noopTour` gets `isPlayDemoSubmit() { return false; }`. Add a module helper:

```ts
function payloadKind(opts?: DemoRefPayload): DemoKind | null {
  if (opts?.demoPatientId) return 'patient';
  if (opts?.demoAppointmentId) return 'appointment';
  if (opts?.demoTransactionId) return 'transaction';
  return null;
}
```

2. **Progress lookup.** Replace the single `tourProgress` (line ~160) with:

```ts
const toursRef = useRef(onboarding?.tours);
toursRef.current = onboarding?.tours;
const progressOf = useCallback(
  (tourId: string) => toursRef.current?.find((t) => t.tourId === tourId),
  [],
);
const demoPatientId = onboarding?.tours.find((t) => t.tourId === 'patients')?.demoPatientId ?? null;
```

Keep `demoPatientIdRef` exactly as today (it feeds `resolveRoute` and the patient replay intercept). Delete `tourProgressRef`; replace its three readers with `progressOf(...)`:
- `beginSession`: `persistedChapterStatus(progressOf(opts.tourId), opts.chapterId)`
- `tryStart`: `const progress = progressOf(opts.tourId);`
- `finishChapter`: `persistedChapterStatus(progressOf(current.tourId), current.chapterId)`

3. **`patchIfPlay` gains the tour id.** Signature `(tourId: string, mode: Mode, body: PatchOnboardingTourRequest)`; body calls `mutateRef.current(tourId, body)`. Update all callers: `beginSession` → `patchIfPlay(opts.tourId, mode, ...)`; `continueAfterChapter` → `patchIfPlay(current.tourId, current.mode, { tourStatus: 'COMPLETED' })`; `finishChapter`/`skipChapter` → `patchIfPlay(current.tourId, current.mode, body)`.

4. **Per-tour gate.** In `tryStart`, replace `if (roleRef.current === UserRole.EMPLOYEE) return false;` with:

```ts
const tour = getTour(opts.tourId);
const chapter = tour?.chapters.find((c) => c.id === opts.chapterId);
if (!tour || !chapter) return false;
const role = roleRef.current;
if (role == null || !tour.canStart(role)) return false;
```

(and delete the now-duplicated `tour`/`chapter` lookup below it). In `hydrateFromSearch`, drop the EMPLOYEE guard and the `parsed.tourId !== 'patients'` check:

```ts
const parsed = parseTourSearch(search);
if (!parsed) return;
const def = getTour(parsed.tourId);
if (!def) return;
if (sessionRef.current) return;
if (!tryStart({ tourId: def.id, chapterId: parsed.chapterId, replay: parsed.replay })) {
  goToHub();
}
```

In `TourUrlHydrator`, remove the `role` prop and its `EMPLOYEE` early-return (effect becomes `if (!ready) return; onSearch(search);`); update the call site in the provider JSX.

5. **Recovery.** In `tryStart`, replace

```ts
if (chapter.id === 'cadastro' && isCadastroPlayRecovery(progress)) {
```

with

```ts
if (isDemoPlayRecovery(tour, chapter, progress)) {
  beginSession({ tourId: opts.tourId, chapterId: chapter.id, replay: false });
  return true;
}
```

6. **`beginSession`/`start` opts types** become `{ tourId: OnboardingTourId; chapterId: string; replay: boolean }`.

7. **Generic replay intercept.** In the click-capture effect, replace the `replayCadastroSubmit` block with:

```ts
const chapter = getTour(session.tourId)?.chapters.find((c) => c.id === session.chapterId);
const replayDemoSubmit =
  session.mode === 'replay' && Boolean(chapter?.createsDemo) && Boolean(step.awaitAction);
if (replayDemoSubmit) {
  event.preventDefault();
  event.stopPropagation();
  if (chapter?.createsDemo === 'patient') {
    const demoId = demoPatientIdRef.current;
    if (demoId) routerRef.current.push(`/patients/${demoId}`);
  } else {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }
  window.setTimeout(() => {
    advanceRef.current();
  }, 0);
  return;
}
```

8. **`finishChapter` carries all refs.** Change the parameter to `extra?: DemoRefPayload` and build the ref fields once:

```ts
const refFields: DemoRefPayload = {};
if (extra?.demoPatientId) refFields.demoPatientId = extra.demoPatientId;
if (extra?.demoAppointmentId) refFields.demoAppointmentId = extra.demoAppointmentId;
if (extra?.demoTransactionId) refFields.demoTransactionId = extra.demoTransactionId;
```

Spread `...refFields` into both the terminal and the normal PATCH bodies (replacing the current `...(extra?.demoPatientId ? { demoPatientId } : {})` spreads). Keep the `demoPatientIdRef.current = extra.demoPatientId` update.

9. **`notifyChapterActionSucceeded`** becomes:

```ts
const notifyChapterActionSucceeded = useCallback(
  async (opts?: DemoRefPayload): Promise<boolean> => {
    const current = sessionRef.current;
    if (!current) return false;
    const tour = getTour(current.tourId);
    const chapter = tour?.chapters.find((c) => c.id === current.chapterId);
    const step = chapter?.steps[current.stepIndex];
    if (!step?.awaitAction) return false;
    const kind = payloadKind(opts);
    if (kind && chapter?.createsDemo !== kind) return false;
    if (opts?.demoPatientId) {
      demoPatientIdRef.current = opts.demoPatientId;
    }
    const isLast = current.stepIndex >= (chapter?.steps.length ?? 0) - 1;
    if (isLast) {
      await finishChapter(opts);
    } else {
      if (kind && opts) void patchIfPlay(current.tourId, current.mode, { ...opts });
      advance();
    }
    return true;
  },
  [advance, finishChapter, patchIfPlay],
);
```

10. **Context value.** Replace `isPlayCadastroSubmit` with:

```ts
isPlayDemoSubmit(kind: DemoKind) {
  const current = sessionRef.current;
  if (current?.mode !== 'play') return false;
  const chapter = getTour(current.tourId)?.chapters.find((c) => c.id === current.chapterId);
  return chapter?.createsDemo === kind;
},
```

11. **`create-patient-form.tsx`:** both `tour.isPlayCadastroSubmit()` call sites become `tour.isPlayDemoSubmit('patient')`. Run `grep -rn "isPlayCadastroSubmit" apps/web/src` and fix any remaining hit (e.g. test mocks of `useTour`) the same way.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @nutri-plus/web test tour-provider create-patient-form`
Expected: PASS — including all pre-existing cases (replay cadastro, notify cadastro, recall flow).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/onboarding/tour-provider.tsx apps/web/src/components/onboarding/tour-provider.test.tsx apps/web/src/components/patients/create-patient-form.tsx
git commit -m "feat(web): multi-tour engine with per-tour gates and generic demo replay"
```

---

### Task 6: Hub — N tour cards + cleanup banners

**Files:**
- Modify: `apps/web/src/components/onboarding/hub-view.tsx`
- Modify: `apps/web/src/components/onboarding/delete-demo-banner.tsx`
- Modify: `apps/web/src/components/onboarding/hub-view.test.tsx`
- Modify: `apps/web/src/components/onboarding/delete-demo-banner.test.tsx` (only if its render breaks — the `DeleteDemoBanner` API is unchanged)

**Interfaces:**
- Consumes: `ALL_TOURS`, `isDemoPlayRecovery`, `playRecoveryChapterId` (Task 4); `TourApi.start` (Task 5); `useDeleteAppointment`, `useDeleteTransaction`, `ONBOARDING_KEY`.
- Produces:
  - `DemoCleanupBanner({ description, idleLabel, isPending, onConfirm })` — generic two-click banner.
  - `DeleteDemoBanner({ patientId })` (unchanged API), `DeleteDemoAppointmentBanner({ appointmentId })`, `DeleteDemoTransactionBanner({ transactionId })`.
  - Hub renders one `Card` per tour with `data-testid="tour-card-{id}"`.

- [ ] **Step 1: Write/adjust the failing tests**

In `hub-view.test.tsx`:

1. Mock the two new query modules (top of file, next to the patients mock):

```ts
const deleteAppointment = vi.fn();
vi.mock('@/lib/queries/appointments', () => ({
  useDeleteAppointment: () => ({ mutateAsync: deleteAppointment, isPending: false }),
}));
const deleteTransaction = vi.fn();
vi.mock('@/lib/queries/transactions', () => ({
  useDeleteTransaction: () => ({ mutateAsync: deleteTransaction, isPending: false }),
}));
```

The new banners use `useQueryClient`, so wrap renders in a `QueryClientProvider` (create a `renderHub(role)` helper with a fresh `QueryClient`, mirroring `renderTour` in `tour-provider.test.tsx`) — update every `render(<HubView .../>)` call to use it. Also update the `useTour` mock key `isPlayCadastroSubmit` → `isPlayDemoSubmit: () => false`.

2. The `tour()` factory gains `demoAppointmentId: null, demoTransactionId: null` defaults.
3. Scope the existing single-card assertions to the patients card. Add a helper and update every ambiguous query:

```ts
function card(id: string) {
  return within(screen.getByTestId(`tour-card-${id}`));
}
// e.g. old: screen.getByRole('button', { name: /começar/i })
// new:      card('patients').getByRole('button', { name: /começar/i })
```

(Tests that already scope via `data-chapter` or unique chapter titles stay as-is.)
4. New tests:

```ts
it('renders the five tour cards in sidebar order', () => {
  renderHub(UserRole.NUTRITIONIST);
  const titles = ['Pacientes', 'Agenda', 'Contabilidade', 'Alimentos', 'Configurações'];
  const cards = screen.getAllByTestId(/tour-card-/);
  expect(cards).toHaveLength(5);
  titles.forEach((title, i) => expect(cards[i]).toHaveTextContent(title));
});

it('lets an employee start Agenda but not Configurações', async () => {
  renderHub(UserRole.EMPLOYEE);
  expect(card('agenda').getByRole('button', { name: /começar/i })).toBeEnabled();
  await userEvent.click(card('agenda').getByRole('button', { name: /começar/i }));
  expect(start).toHaveBeenCalledWith({ tourId: 'agenda', chapterId: 'visao-geral', replay: false });
  expect(card('configuracoes').getByRole('button', { name: /começar/i })).toBeDisabled();
  expect(
    card('configuracoes').getByText('Este tutorial é feito pelo nutricionista (configurações da conta).'),
  ).toBeInTheDocument();
});

it('shows the demo appointment banner and deletes through it', async () => {
  onboardingState.data = {
    promptDismissedAt: null,
    tours: [
      tour({
        tourId: 'agenda',
        status: 'COMPLETED',
        completedAt: 'x',
        demoAppointmentId: 'apt-1',
        chapters: [chapter('agendamento', 'COMPLETED')],
      }),
    ],
  };
  renderHub(UserRole.NUTRITIONIST);
  expect(card('agenda').getByText('Este é um agendamento de demonstração.')).toBeInTheDocument();
  await userEvent.click(card('agenda').getByRole('button', { name: 'Apagar agendamento de demonstração' }));
  await userEvent.click(card('agenda').getByRole('button', { name: 'Confirmar exclusão' }));
  expect(deleteAppointment).toHaveBeenCalledWith('apt-1');
});

it('shows the demo transaction banner when the ref is set', () => {
  onboardingState.data = {
    promptDismissedAt: null,
    tours: [
      tour({
        tourId: 'contabilidade',
        status: 'IN_PROGRESS',
        demoTransactionId: 'tx-1',
      }),
    ],
  };
  renderHub(UserRole.NUTRITIONIST);
  expect(card('contabilidade').getByText('Este é um lançamento de demonstração.')).toBeInTheDocument();
});
```

(The `tour()` factory accepts `tourId` via its `Partial` spread already.)

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @nutri-plus/web test hub-view`
Expected: FAIL.

- [ ] **Step 3: Implement**

`delete-demo-banner.tsx` — rewrite as:

```tsx
'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useDeleteAppointment } from '@/lib/queries/appointments';
import { useDeleteDemoPatient } from '@/lib/queries/patients';
import { useDeleteTransaction } from '@/lib/queries/transactions';
import { ONBOARDING_KEY } from '@/lib/queries/onboarding';

export function DemoCleanupBanner({
  description,
  idleLabel,
  isPending,
  onConfirm,
}: {
  description: string;
  idleLabel: string;
  isPending: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
      <p className="flex-1 text-sm">{description}</p>
      <Button
        type="button"
        variant={confirming ? 'destructive' : 'outline'}
        disabled={isPending}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          void onConfirm();
        }}
      >
        {confirming ? 'Confirmar exclusão' : idleLabel}
      </Button>
    </div>
  );
}

export function DeleteDemoBanner({ patientId }: { patientId: string }) {
  const { mutateAsync, isPending } = useDeleteDemoPatient();
  return (
    <DemoCleanupBanner
      description="Este é um paciente de demonstração."
      idleLabel="Apagar paciente de demonstração"
      isPending={isPending}
      onConfirm={() => void mutateAsync(patientId)}
    />
  );
}

export function DeleteDemoAppointmentBanner({ appointmentId }: { appointmentId: string }) {
  const qc = useQueryClient();
  const { mutateAsync, isPending } = useDeleteAppointment();
  return (
    <DemoCleanupBanner
      description="Este é um agendamento de demonstração."
      idleLabel="Apagar agendamento de demonstração"
      isPending={isPending}
      onConfirm={async () => {
        await mutateAsync(appointmentId);
        await qc.invalidateQueries({ queryKey: ONBOARDING_KEY });
      }}
    />
  );
}

export function DeleteDemoTransactionBanner({ transactionId }: { transactionId: string }) {
  const qc = useQueryClient();
  const { mutateAsync, isPending } = useDeleteTransaction();
  return (
    <DemoCleanupBanner
      description="Este é um lançamento de demonstração."
      idleLabel="Apagar lançamento de demonstração"
      isPending={isPending}
      onConfirm={async () => {
        await mutateAsync(transactionId);
        await qc.invalidateQueries({ queryKey: ONBOARDING_KEY });
      }}
    />
  );
}
```

`hub-view.tsx` — restructure: extract the current card body into a `TourCard` component and map the registry. Keep `CHAPTER_STATUS_LABEL`, `aiLockCopy`, `lockReasonText`, the page header, and all pt-BR copy as they are.

```tsx
function TourDemoBanner({
  def,
  tour,
}: {
  def: TourDefinition;
  tour: OnboardingTourProgressView | undefined;
}) {
  if (!tour) return null;
  if (def.id === 'patients' && tour.demoPatientId) {
    return <DeleteDemoBanner patientId={tour.demoPatientId} />;
  }
  if (def.id === 'agenda' && tour.demoAppointmentId) {
    return <DeleteDemoAppointmentBanner appointmentId={tour.demoAppointmentId} />;
  }
  if (def.id === 'contabilidade' && tour.demoTransactionId) {
    return <DeleteDemoTransactionBanner transactionId={tour.demoTransactionId} />;
  }
  return null;
}

function TourCard({
  def,
  tour,
  role,
  entitlements,
}: {
  def: TourDefinition;
  tour: OnboardingTourProgressView | undefined;
  role: UserRole | null;
  entitlements: Entitlements | undefined;
}) {
  const { start } = useTour();
  const cta = primaryCta(tour);
  const canStart = role != null && def.canStart(role);
  const playChapterId = continuePlayChapterId(def, tour, entitlements);
  const replayChapterId = def.chapters.find((chapter) => {
    const { status } = chapterView(chapter, tour, entitlements);
    return status === "completed" || status === "skipped";
  })?.id;

  function play(chapterId: string | null, replay = false) {
    if (!canStart || !chapterId) return;
    const chapter = def.chapters.find((item) => item.id === chapterId);
    if (!chapter) return;
    const { status } = chapterView(chapter, tour, entitlements);
    const recovering = isDemoPlayRecovery(def, chapter, tour);
    if (status === "locked") return;
    if ((status === "completed" || status === "skipped") && !replay && !recovering) return;
    start({ tourId: def.id, chapterId, replay });
  }

  function replay(chapterId: string) {
    play(chapterId, true);
  }

  function playChapter(chapterId: string) {
    const chapter = def.chapters.find((item) => item.id === chapterId);
    if (!chapter) return;
    const { status } = chapterView(chapter, tour, entitlements);
    if (status === "completed" || status === "skipped") {
      replay(chapterId);
      return;
    }
    play(chapterId, false);
  }

  return (
    <Card data-testid={`tour-card-${def.id}`}>
      <CardHeader>
        <CardTitle>{def.title}</CardTitle>
        <CardDescription>{def.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TourDemoBanner def={def} tour={tour} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {def.chapters.map((chapter) => {
            /* identical to the current chapter sub-card block, with two renames:
               PATIENTS_TOUR → def, and
               (chapter.id === "cadastro" && isCadastroPlayRecovery(tour))
                 → isDemoPlayRecovery(def, chapter, tour) */
          })}
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-3">
        {/* identical CTA block (Começar/Continuar/Concluído+Rever), then: */}
        {!canStart && role != null ? (
          <p className="text-sm text-muted-foreground">
            {def.startLockedText ?? "Este tutorial é feito pelo nutricionista."}
          </p>
        ) : null}
      </CardFooter>
    </Card>
  );
}

export function HubView({ role }: { role: UserRole | null }) {
  const { data: onboarding } = useOnboarding();
  const { data: subscription } = useSubscription();
  const entitlements = subscription?.entitlements;

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* existing header block unchanged */}
        {ALL_TOURS.map((def) => (
          <TourCard
            key={def.id}
            def={def}
            tour={onboarding?.tours.find((row) => row.tourId === def.id)}
            role={role}
            entitlements={entitlements}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}
```

Imports: drop `canManagePatients`/`PATIENTS_TOUR`/`isCadastroPlayRecovery`; add `ALL_TOURS`, `type TourDefinition`, `isDemoPlayRecovery`, `type OnboardingTourProgressView`, and the two new banner components. The standalone top-level `DeleteDemoBanner` render (old lines 130-132) is deleted — banners now live inside each card.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @nutri-plus/web test hub-view delete-demo-banner first-run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/onboarding
git commit -m "feat(web): multi-tour hub with per-tour demo cleanup banners"
```

---

### Task 7: Agenda — anchors, fixture, notify

**Files:**
- Modify: `apps/web/src/components/agenda/agenda-view.tsx`
- Modify: `apps/web/src/components/agenda/appointment-dialog.tsx`
- Modify: `apps/web/src/components/agenda/categories-view.tsx`
- Modify: `apps/web/src/components/agenda/category-dialog.tsx`
- Test: `agenda-view.test.tsx`, `appointment-dialog.test.tsx`, `categories-view.test.tsx`, `category-dialog.test.tsx` (extend with their existing mocks/render helpers)

**Interfaces:**
- Consumes: `registerFixture` (fixtures), `useTour().notifyChapterActionSucceeded` (Task 5), `useOnboarding` (for the demo patient), `toDateInput`/`toTimeInput` from `@/lib/agenda/dates`.
- Produces: every `agenda.*` anchor in the catalog exists in the DOM when its screen/dialog is mounted; fixture `appointment` registered while the create dialog is open; successful create reports `{ demoAppointmentId }`.

- [ ] **Step 1: Write the failing test assertions** (add one `it` per file, using each file's existing setup; agenda components use double quotes)

`agenda-view.test.tsx`:

```ts
it('exposes the agenda tour anchors', () => {
  // use this file's existing render helper/mocks
  expect(screen.getByRole('heading', { name: 'Agenda' })).toHaveAttribute('data-tour', 'agenda.view');
  expect(screen.getByRole('button', { name: 'Novo agendamento' })).toHaveAttribute('data-tour', 'agenda.new');
  expect(document.querySelector('[data-tour="agenda.toggle"]')).not.toBeNull();
  expect(document.querySelector('[data-tour="agenda.nav"]')).not.toBeNull();
});
```

`appointment-dialog.test.tsx` (render in create mode with the file's mocks):

```ts
it('exposes the agenda dialog anchors', () => {
  expect(document.querySelector('form[data-tour="agenda.form"]')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Salvar' })).toHaveAttribute('data-tour', 'agenda.save');
});

it('fills the appointment fixture without submitting', () => {
  act(() => runFixture('appointment'));
  expect(screen.getByLabelText('Título *')).toHaveValue('Consulta de demonstração');
});
```

(`import { act } from '@testing-library/react';` and `import { runFixture } from '@/lib/onboarding/fixtures';` — the fixture registers on mount because the dialog renders open in these tests. If the file mocks `@/lib/queries/appointment-categories` with no default category, the fixture leaves `categoryId` unset — the title assertion is the stable one.)

The dialog now calls `useOnboarding`, which is a real react-query hook — add this mock at the top of `appointment-dialog.test.tsx` next to the other query mocks, or every existing test in the file crashes without a `QueryClientProvider`:

```ts
vi.mock('@/lib/queries/onboarding', () => ({
  useOnboarding: () => ({ data: undefined }),
}));
```

`categories-view.test.tsx`:

```ts
expect(screen.getByRole('heading', { name: 'Categorias' })).toHaveAttribute('data-tour', 'agenda.categories');
expect(screen.getByRole('button', { name: 'Nova categoria' })).toHaveAttribute('data-tour', 'agenda.category.new');
```

`category-dialog.test.tsx`:

```ts
expect(document.querySelector('form[data-tour="agenda.category.form"]')).not.toBeNull();
expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveAttribute('data-tour', 'agenda.category.cancel');
```

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @nutri-plus/web test src/components/agenda`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement**

`agenda-view.tsx`:
- `<h1 ...>Agenda</h1>` → add `data-tour="agenda.view"`.
- The Mês/Lista wrapper `<div className="flex rounded-full border bg-card p-0.5">` → add `data-tour="agenda.toggle"`.
- The month-nav row `<div className="mb-3 flex items-center gap-2">` → add `data-tour="agenda.nav"`.
- The `Novo agendamento` `<Button>` → add `data-tour="agenda.new"`.

`appointment-dialog.tsx`:
- `<form ...>` → add `data-tour="agenda.form"`.
- Submit `<Button type="submit" ...>` → add `data-tour="agenda.save"`.
- Imports: `registerFixture`, `useTour`, `useOnboarding`, `toDateInput`/`toTimeInput` (already imported).
- Inside the component:

```tsx
const tour = useTour();
const { data: onboarding } = useOnboarding();
const demoPatientId =
  onboarding?.tours.find((t) => t.tourId === "patients")?.demoPatientId ?? null;

useEffect(() => {
  if (!open || mode !== "create") return;
  return registerFixture("appointment", () => {
    const category =
      categories.data?.find((c) => c.isDefault) ?? categories.data?.[0];
    const hasDemoPatient =
      demoPatientId != null &&
      (patients.data?.items ?? []).some((p) => p.id === demoPatientId);
    const day = new Date();
    day.setDate(day.getDate() + 1);
    form.reset({
      title: "Consulta de demonstração",
      patientId: hasDemoPatient ? demoPatientId : undefined,
      categoryId: category?.id,
      date: toDateInput(day),
      startTime: "09:00",
      endTime: "10:00",
      description: "Criado pelo tour de primeiros passos.",
    });
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [open, mode, categories.data, patients.data, demoPatientId]);
```

- In `onSubmit`, create branch: capture the result and notify before closing:

```tsx
const created = await create.mutateAsync({
  /* existing body unchanged */
});
toast.success("Agendamento criado.");
if (created?.id) {
  await tour.notifyChapterActionSucceeded({ demoAppointmentId: created.id });
}
```

(keep `onOpenChange(false)` where it is, after the if/else). The `created?.id` guard exists because the existing test file mocks `mutateAsync` resolving `undefined` — outside a tour the call is a no-op anyway (`useTour` returns the noop API).

`categories-view.tsx`: `data-tour="agenda.categories"` on the `<h1>`; `data-tour="agenda.category.new"` on the `Nova categoria` Button.

`category-dialog.tsx`: `data-tour="agenda.category.form"` on the `<form>`; `data-tour="agenda.category.cancel"` on the `Cancelar` Button.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @nutri-plus/web test src/components/agenda`
Expected: PASS (existing dialog submit/validation tests untouched).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/agenda
git commit -m "feat(web): agenda tour anchors, demo-appointment fixture and notify"
```

---

### Task 8: Contabilidade — anchors, fixture, notify

**Files:**
- Modify: `apps/web/src/components/accounting/accounting-view.tsx`
- Modify: `apps/web/src/components/accounting/transaction-dialog.tsx`
- Modify: `apps/web/src/components/accounting/transaction-categories-view.tsx`
- Modify: `apps/web/src/components/accounting/transaction-category-dialog.tsx`
- Create: `apps/web/src/components/accounting/accounting-view.test.tsx`
- Test: extend `transaction-dialog.test.tsx`, `transaction-categories-view.test.tsx`, `transaction-category-dialog.test.tsx` (create the last one if it does not exist, mirroring `transaction-dialog.test.tsx`'s mocks)

**Interfaces:**
- Consumes: same engine APIs as Task 7.
- Produces: every `contabilidade.*` anchor exists when its screen/dialog is mounted; fixture `transaction`; successful create reports `{ demoTransactionId }`.

- [ ] **Step 1: Write the failing tests**

Create `accounting-view.test.tsx` (single quotes; copy the statement fixture shape from `statement-table.test.tsx` so `SummaryCards`/`StatementTable` render):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/accounting/monthly-chart', () => ({
  MonthlyChart: () => <div data-testid="chart-stub" />,
}));
vi.mock('@/lib/queries/transaction-categories', () => ({
  useTransactionCategories: () => ({ data: [] }),
}));
vi.mock('@/lib/queries/transactions', () => ({
  // statement: reuse the minimal AccountingStatement fixture from statement-table.test.tsx
  useStatement: () => ({ isLoading: false, isError: false, data: STATEMENT_FIXTURE }),
  useCreateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { AccountingView } from './accounting-view';

describe('AccountingView tour anchors', () => {
  it('exposes the contabilidade anchors', () => {
    render(<AccountingView />);
    expect(screen.getByRole('heading', { name: 'Contabilidade' })).toHaveAttribute(
      'data-tour',
      'contabilidade.view',
    );
    expect(screen.getByRole('button', { name: 'Nova transação' })).toHaveAttribute(
      'data-tour',
      'contabilidade.new',
    );
    expect(document.querySelector('[data-tour="contabilidade.nav"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="contabilidade.chart"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="contabilidade.cards"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="contabilidade.table"]')).not.toBeNull();
  });
});
```

(Define `STATEMENT_FIXTURE` at the top of the file by copying the statement object used in `statement-table.test.tsx` — totals + items + opening balance, exactly as that file builds it.)

`transaction-dialog.test.tsx` additions:

```ts
it('exposes the transaction dialog anchors', () => {
  expect(document.querySelector('form[data-tour="contabilidade.form"]')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Salvar' })).toHaveAttribute('data-tour', 'contabilidade.save');
});

it('fills the transaction fixture without submitting', () => {
  act(() => runFixture('transaction'));
  expect(screen.getByLabelText('Valor (R$) *')).toHaveValue('100,00');
  expect(screen.getByLabelText('Descrição')).toHaveValue('Lançamento de demonstração');
});
```

`transaction-categories-view.test.tsx`: heading has `contabilidade.categories`; `Nova categoria` button has `contabilidade.category.new`.
`transaction-category-dialog` test: form has `contabilidade.category.form`; `Cancelar` has `contabilidade.category.cancel`.

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @nutri-plus/web test src/components/accounting`
Expected: FAIL.

- [ ] **Step 3: Implement**

`accounting-view.tsx`:
- `<h1 ...>Contabilidade</h1>` → `data-tour="contabilidade.view"`.
- Month-nav wrapper `<div className="flex items-center gap-2">` → `data-tour="contabilidade.nav"`.
- `Nova transação` Button → `data-tour="contabilidade.new"`.
- Wrap the chart: `<div data-tour="contabilidade.chart"><MonthlyChart /></div>`.
- In the success branch: `<div data-tour="contabilidade.cards"><SummaryCards totals={statement.data.totals} /></div>` and `<div data-tour="contabilidade.table"><StatementTable statement={statement.data} onEdit={(item) => setEditing(item)} /></div>`.

`transaction-dialog.tsx`:
- `<form ...>` → `data-tour="contabilidade.form"`; submit Button → `data-tour="contabilidade.save"`.
- Imports: `registerFixture`, `useTour` (`useEffect` already imported).
- Fixture (register when creating):

```tsx
const tour = useTour();

useEffect(() => {
  if (!open || transaction) return;
  return registerFixture('transaction', () => {
    const income = (categories.data ?? []).filter((c) => c.type === 'INCOME');
    form.reset({
      type: 'INCOME',
      amount: '100,00',
      occurredOn: new Date().toISOString().slice(0, 10),
      categoryId: income[0]?.id ?? null,
      description: 'Lançamento de demonstração',
    });
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [open, transaction, categories.data]);
```

- `onSubmit` create branch:

```tsx
const created = await create.mutateAsync(body);
toast.success('Transação registrada.');
if (created?.id) {
  await tour.notifyChapterActionSucceeded({ demoTransactionId: created.id });
}
```

(Same `created?.id` guard rationale as the appointment dialog: existing tests mock `mutateAsync` resolving `undefined`.)

`transaction-categories-view.tsx`: anchors on `<h1>` and `Nova categoria`.
`transaction-category-dialog.tsx`: anchors on `<form>` and `Cancelar`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @nutri-plus/web test src/components/accounting`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/accounting
git commit -m "feat(web): contabilidade tour anchors, demo-transaction fixture and notify"
```

---

### Task 9: Alimentos — anchors + search fixture

**Files:**
- Modify: `apps/web/src/components/foods/foods-browse.tsx`
- Create: `apps/web/src/components/foods/foods-browse.test.tsx`

**Interfaces:**
- Consumes: `registerFixture`.
- Produces: anchors `alimentos.search` (always mounted) and `alimentos.table` (mounted once a search has results); fixture `foods-search` sets the search term to `arroz`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { runFixture } from '@/lib/onboarding/fixtures';

vi.mock('@/lib/hooks/use-debounced-value', () => ({
  useDebouncedValue: (value: string) => value,
}));
vi.mock('@/lib/queries/foods', () => ({
  useFoodSearch: (term: string) => ({
    data:
      term.trim().length >= 2
        ? [
            {
              id: 'f1',
              name: 'Arroz, integral, cozido',
              group: 'Cereais e derivados',
              energyKcal: 123.5,
              protein: 2.6,
              carbohydrate: 25.8,
              lipid: 1,
              fiber: 2.7,
              sodium: 1,
            },
          ]
        : [],
    isLoading: false,
    isError: false,
    isFetching: false,
  }),
}));

import { FoodsBrowse } from './foods-browse';

describe('FoodsBrowse tour', () => {
  it('exposes the search anchor and fills the fixture', () => {
    render(<FoodsBrowse />);
    const input = screen.getByLabelText('Buscar alimento');
    expect(input).toHaveAttribute('data-tour', 'alimentos.search');
    expect(document.querySelector('[data-tour="alimentos.table"]')).toBeNull();

    act(() => runFixture('foods-search'));

    expect(input).toHaveValue('arroz');
    expect(screen.getByText('Arroz, integral, cozido')).toBeInTheDocument();
    expect(document.querySelector('[data-tour="alimentos.table"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @nutri-plus/web test foods-browse`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `foods-browse.tsx` (single quotes):
- Import `useEffect` and `registerFixture`.
- `useEffect(() => registerFixture('foods-search', () => setSearch('arroz')), []);`
- Add `data-tour="alimentos.search"` to the `<Input>`.
- Add `data-tour="alimentos.table"` to the results container `<div className={'overflow-hidden rounded-xl border bg-card' + ...}>`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @nutri-plus/web test foods-browse food-search`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/foods
git commit -m "feat(web): alimentos tour anchors and search fixture"
```

---

### Task 10: Configurações — anchors + full verification

**Files:**
- Modify: `apps/web/src/components/settings/settings-view.tsx`
- Modify: `apps/web/src/components/settings/settings-view.test.tsx`

**Interfaces:**
- Consumes: nothing new (anchors only — the tour never submits here).
- Produces: the 8 `config.*` anchors from the catalog.

- [ ] **Step 1: Write the failing assertions** (inside the existing loaded-state test setup of `settings-view.test.tsx`)

```ts
it('exposes the configurações tour anchors', async () => {
  // reuse the file's existing render + loaded-settings mocks
  expect(document.querySelector('[data-tour="config.tabs"]')).not.toBeNull();
  expect(document.querySelector('[data-tour="config.plano"]')).not.toBeNull();
  expect(screen.getByRole('tab', { name: 'Aparência' })).toHaveAttribute('data-tour', 'config.tab.aparencia');
  expect(screen.getByRole('tab', { name: 'Aplicativo Paciente' })).toHaveAttribute('data-tour', 'config.tab.app');
  expect(screen.getByRole('tab', { name: 'Assinatura' })).toHaveAttribute('data-tour', 'config.tab.assinatura');
});
```

(The `config.aparencia`/`config.app`/`config.assinatura` sections mount only when their tab is active; if the existing test file already switches tabs, add `not.toBeNull()` checks after each switch — otherwise the anchor presence on the default tab plus the three triggers is the smoke coverage.)

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter @nutri-plus/web test settings-view`
Expected: FAIL.

- [ ] **Step 3: Implement** (in `settings-view.tsx`, single quotes)

- `<TabsList>` → `data-tour="config.tabs"`.
- `<TabsTrigger value="aparencia">` → `data-tour="config.tab.aparencia"`; `value="app"` → `data-tour="config.tab.app"`; `value="assinatura"` → `data-tour="config.tab.assinatura"`.
- The `<section>` inside `TabsContent value="plano"` → `data-tour="config.plano"`; inside `"aparencia"` → `data-tour="config.aparencia"`; inside `"app"` → `data-tour="config.app"`; inside `"assinatura"` → `data-tour="config.assinatura"`.
- Do NOT put anchors on either `type="submit"` button — the tour must never highlight a save control here.

- [ ] **Step 4: Full verification (all three suites)**

Run:
`pnpm --filter @nutri-plus/shared-types build`
`pnpm --filter @nutri-plus/api test`
`pnpm --filter @nutri-plus/web test`

Expected: all PASS. If any pre-existing test still references removed names (`isCadastroPlayRecovery`, `isPlayCadastroSubmit`) or misses the new view fields, fix it now — `grep -rn "isCadastroPlayRecovery\|isPlayCadastroSubmit" apps/web/src` must return nothing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/settings
git commit -m "feat(web): configurações tour anchors"
```

---

## Self-review (plan vs spec)

| Spec section | Task |
|---|---|
| 5 tour ids em `ONBOARDING_TOUR_IDS` | 1 |
| View/Patch com `demoAppointmentId`/`demoTransactionId` | 1, 3 |
| Migração aditiva (2 FKs, SetNull) | 2 |
| API persiste/expõe refs; monotônico intacto | 3 |
| Registry `ALL_TOURS` + `canStart` + `startLockedText` | 4 |
| `createsDemo` no catálogo (patients cadastro incluído) | 4 |
| Recovery só para tours com capítulos `requiresDemo` | 4 (`isDemoPlayRecovery`) |
| Gate por tour no motor (EMPLOYEE agenda ✓ / configuracoes ✗, URL incluída) | 5 |
| PATCH usa `session.tourId` | 5 |
| Replay de submit `createsDemo`: prevent + Escape/push + zero PATCH | 5 |
| Notify com guarda de kind + PATCH do ref em passo não-final | 5 |
| Hub N cards + locked text por tour | 6 |
| Banners de limpeza (deletes existentes + invalidação de onboarding) | 6 |
| Tour Agenda (3 capítulos, agendamento-demo com paciente-demo fallback) | 4 (catálogo) + 7 |
| Tour Contabilidade (3 capítulos, lançamento-demo Receita R$100) | 4 + 8 |
| Tour Alimentos (1 capítulo read-only, fixture `arroz`) | 4 + 9 |
| Tour Configurações (4 capítulos = 4 tabs, nada salvo) | 4 + 10 |
| Delete demo-patient com agendamento vinculado | Já coberto (ciclo 1) — sem task |
| First-run intacto | Constraint global (nenhuma task toca) |
| Testes API + web, sem Playwright | 1, 3, 4, 5, 6, 7, 8, 9, 10 |
