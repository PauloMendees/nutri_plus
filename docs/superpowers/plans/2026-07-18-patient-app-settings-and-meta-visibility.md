# Patient-App Settings Defaults + Patient Meta Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let patients see their current nutrition target (kcal + macros) in the mobile app via a per-patient opt-in, and let the nutritionist set patient-app defaults in a new "Aplicativo Paciente" settings tab (applied to newly-created patients).

**Architecture:** Three new boolean columns (one per-patient, two nutritionist-default); `createPatient` seeds the per-patient toggles from the nutritionist defaults; a patient-scoped `GET /me/nutrition-target` returns a strict safe subset; web settings become tabbed; the mobile home shows a "Sua meta" card.

**Tech Stack:** NestJS + Prisma, Next.js + react-query + react-hook-form, Expo, `@nutri-plus/shared-types`.

## Global Constraints

- Branch `feat/nutrition-targets` (STAY on it — bundles onto open PR #45; spec committed a5fde17). Additive migration. shared-types rebuilt. NO new dependencies. pt-BR.
- Defaults are applied **only at `createPatient`** (never rewrite existing patients); the per-patient value wins on update.
- `GET /me/nutrition-target` is a **strict patient-safe subset**: `targetCalories`, `proteinGrams`, `carbGrams`, `fatGrams` only — NEVER `tmb`/`get`/`formula`/`activityFactor`/inputs — and returns `null` when the patient's own `showMealTargetToPatient` is false or there is no target.
- "Aplicativo Paciente" tab: an explanatory paragraph (defaults for new patients, changeable per patient on the detail page) + a **tooltip on each** setting.
- Adding required `showMealTargetToPatient` to `PatientSummary` and the 2 defaults to `NutritionistSettings` breaks strict-literal fixtures — update them (tsc lists them).
- Match file quote styles (api single quotes; **`edit-patient-form.tsx` uses double quotes**; mobile single quotes). API + mobile tests JEST / web vitest.
- Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push/PR.

---

### Task 1: Foundation — schema + shared-types

**Files:** `apps/api/prisma/schema.prisma` (+ migration); `packages/shared-types/src/v1/patient.ts`, `nutritionist-settings.ts`, `nutrition-target.ts`, `index.ts` (already exports these).

- [ ] **Step 1: Prisma**

In `schema.prisma`:
- `model PatientProfile`: add after `canLogAssessments Boolean @default(false)`:
```prisma
  showMealTargetToPatient Boolean @default(false)
```
- `model NutritionistProfile`: add (near `mealPlanAiInstructions`):
```prisma
  defaultCanLogAssessments      Boolean @default(false)
  defaultShowMealTargetToPatient Boolean @default(false)
```

- [ ] **Step 2: Migrate + generate**

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name patient-app-defaults`
Expected: additive migration (3 ADD COLUMN, all with defaults), applied, client regenerated (run `pnpm --filter @nutri-plus/api exec prisma generate` if not).

- [ ] **Step 3: shared-types**

- `packages/shared-types/src/v1/patient.ts`: add `showMealTargetToPatient: boolean;` to `PatientSummary` (after `canLogAssessments`); add `showMealTargetToPatient?: boolean;` to `UpdatePatientRequest` (it's `Omit<CreatePatientRequest,'name'|'email'> & { canLogAssessments?: boolean }` — add the new optional alongside `canLogAssessments`).
- `packages/shared-types/src/v1/nutritionist-settings.ts`: add to `NutritionistSettings`: `defaultCanLogAssessments: boolean;` + `defaultShowMealTargetToPatient: boolean;`. Add to `UpdateNutritionistSettingsRequest`: both as optional (`?: boolean`).
- `packages/shared-types/src/v1/nutrition-target.ts`: add:
```ts
export interface MyNutritionTarget {
  targetCalories: number;
  proteinGrams: number;
  carbGrams: number;
  fatGrams: number;
}
```
(The `GET /me/nutrition-target` response is `MyNutritionTarget | null`.)

Build: `pnpm --filter @nutri-plus/shared-types build` (exit 0).

- [ ] **Step 4: Commit** (`feat: patient-app default flags + shared types`).

---

### Task 2: API — defaults at creation, per-patient toggle, settings, patient meta endpoint

**Files:** `apps/api/src/patients/patients.service.ts`, `dto/update-patient.dto.ts`; `apps/api/src/nutritionist-settings/nutritionist-settings.service.ts`, `dto/update-nutritionist-settings.dto.ts`; `apps/api/src/nutrition-targets/nutrition-targets.service.ts`, a new `me-nutrition-target.controller.ts`, `nutrition-targets.module.ts`; specs alongside.

- [ ] **Step 1: UpdatePatientDto — the per-patient toggle**

In `apps/api/src/patients/dto/update-patient.dto.ts`, add after `canLogAssessments`:
```ts
  @IsOptional()
  @IsBoolean()
  showMealTargetToPatient?: boolean;
```

- [ ] **Step 2: createPatient — seed toggles from nutritionist defaults**

In `patients.service.ts` `createPatient`, before calling `createInvitedPatient`, load the nutritionist's defaults and inject them into `clinical` (the spread that reaches the `patientProfile.create`):
```ts
  async createPatient(ctx: AuthContext, dto: CreatePatientDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const { name, email, ...clinical } = dto;

    const defaults = await this.prisma.nutritionistProfile.findUniqueOrThrow({
      where: { id: nutritionistId },
      select: { defaultCanLogAssessments: true, defaultShowMealTargetToPatient: true },
    });

    const { id: authProviderId } = await this.supabaseAdmin.inviteUser(email, { name });

    let profileId: string;
    try {
      const localUser = await this.users.createInvitedPatient({
        authProviderId,
        email,
        name,
        nutritionistId,
        clinical: {
          ...clinical,
          canLogAssessments: defaults.defaultCanLogAssessments,
          showMealTargetToPatient: defaults.defaultShowMealTargetToPatient,
        },
      });
      profileId = localUser.patientProfile!.id;
    } catch (error) {
      await this.supabaseAdmin.deleteUser(authProviderId);
      throw error;
    }

    return this.getPatient(ctx, profileId);
  }
```
(`createInvitedPatient`'s `clinical: UpdatePatientDto` now includes both booleans, spread into `patientProfile.create`. `updatePatient` already applies the DTO, so the per-patient `showMealTargetToPatient` persists there with no service change beyond the DTO field.)

- [ ] **Step 3: Settings — expose + update the 2 defaults**

In `nutritionist-settings.service.ts`, extend `SELECT` and the update `data`:
```ts
const SELECT = {
  displayName: true,
  logoUrl: true,
  mealPlanAiInstructions: true,
  defaultCanLogAssessments: true,
  defaultShowMealTargetToPatient: true,
} as const;
```
and in `updateSettings` `data`:
```ts
      data: {
        displayName: dto.displayName,
        mealPlanAiInstructions: dto.mealPlanAiInstructions,
        defaultCanLogAssessments: dto.defaultCanLogAssessments,
        defaultShowMealTargetToPatient: dto.defaultShowMealTargetToPatient,
      },
```
In `dto/update-nutritionist-settings.dto.ts`, add:
```ts
  @IsOptional()
  @IsBoolean()
  defaultCanLogAssessments?: boolean;

  @IsOptional()
  @IsBoolean()
  defaultShowMealTargetToPatient?: boolean;
```
(Import `IsBoolean` from `class-validator`.)

- [ ] **Step 4: Patient meta endpoint — service method (failing spec first)**

In `nutrition-targets.service.spec.ts` add tests for a new `getMineForPatient(ctx)`: returns `null` when the patient's `showMealTargetToPatient` is false; returns `null` when true but no target; returns `{ targetCalories, proteinGrams, carbGrams, fatGrams }` (and NO other fields) when visible + a target exists. Mock prisma + `resolveScopePatientId`. Run → FAIL.

Implement in `nutrition-targets.service.ts` (import `resolveScopePatientId` from `../auth/auth-scope`):
```ts
  async getMineForPatient(ctx: AuthContext): Promise<{
    targetCalories: number;
    proteinGrams: number;
    carbGrams: number;
    fatGrams: number;
  } | null> {
    const patientId = resolveScopePatientId(ctx);
    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { showMealTargetToPatient: true },
    });
    if (!patient?.showMealTargetToPatient) return null;
    const latest = await this.prisma.nutritionTarget.findFirst({
      where: { patientId },
      orderBy: { targetDate: 'desc' },
    });
    if (!latest) return null;
    return {
      targetCalories: latest.targetCalories,
      proteinGrams: latest.proteinGrams,
      carbGrams: latest.carbGrams,
      fatGrams: latest.fatGrams,
    };
  }
```

- [ ] **Step 5: Patient meta endpoint — controller + module**

Create `apps/api/src/nutrition-targets/me-nutrition-target.controller.ts` (mirror `PatientAssessmentsController`):
```ts
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { NutritionTargetsService } from './nutrition-targets.service';

@ApiTags('nutrition-targets')
@ApiBearerAuth()
@Controller({ path: 'me/nutrition-target', version: '1' })
@Roles(UserRole.PATIENT)
export class MeNutritionTargetController {
  constructor(private readonly service: NutritionTargetsService) {}

  @Get()
  get(@CurrentUser() ctx: AuthContext) {
    return this.service.getMineForPatient(ctx);
  }
}
```
Register `MeNutritionTargetController` in `nutrition-targets.module.ts` `controllers: [...]`.

- [ ] **Step 6: Specs — createPatient defaults + settings**

Extend `patients.service.spec.ts` (or wherever createPatient is tested): assert `createInvitedPatient` is called with `clinical` containing `canLogAssessments` + `showMealTargetToPatient` equal to the mocked nutritionist defaults. Extend `nutritionist-settings.service.spec.ts`: GET returns the 2 defaults; update writes them. (Mirror the existing spec style; mock prisma.)

- [ ] **Step 7: Verify + commit**

Run: `pnpm --filter @nutri-plus/api test` (green) + `pnpm --filter @nutri-plus/api exec tsc --noEmit` (exit 0). Commit (`feat(api): patient-app defaults + patient meta endpoint`).

---

### Task 3: Web — settings tabs + "Aplicativo Paciente" + patient-detail toggle

**Files:** `apps/web/src/components/settings/settings-view.tsx`, `apps/web/src/lib/validation/settings.ts`, `apps/web/src/lib/api/settings.ts` + `lib/queries/settings.ts` (verify they carry the new fields), `apps/web/src/components/patients/edit-patient-form.tsx`; fixtures + tests.

- [ ] **Step 1: Settings validation + defaults carry the 2 booleans**

In `apps/web/src/lib/validation/settings.ts`, add `defaultCanLogAssessments: z.boolean()` + `defaultShowMealTargetToPatient: z.boolean()` to `settingsSchema` (so `SettingsValues` includes them). In `settings-view.tsx` `defaults(s?)`, add `defaultCanLogAssessments: s?.defaultCanLogAssessments ?? false` and `defaultShowMealTargetToPatient: s?.defaultShowMealTargetToPatient ?? false`. Confirm `lib/api/settings.ts` update sends the full `SettingsValues` body (`UpdateNutritionistSettingsRequest`) — it already posts the form values, so the 2 booleans flow through.

- [ ] **Step 2: Tabs + Aplicativo Paciente tab**

In `settings-view.tsx`, wrap the two existing `<section>`s + the new tab in shadcn `<Tabs defaultValue="plano">` (import `Tabs, TabsContent, TabsList, TabsTrigger` from `@/components/ui/tabs`). Keep the single `<Form>`/`<form onSubmit={form.handleSubmit(onSubmit)}>` wrapping the Tabs so one submit saves all fields.
- `<TabsTrigger value="plano">Plano alimentar</TabsTrigger>`, `value="aparencia">Aparência`, `value="app">Aplicativo Paciente`.
- `plano` content = the existing "Plano alimentar" section (logo + displayName + mealPlanAiInstructions) + its save button.
- `aparencia` content = the existing `<ThemeToggleSwitch />` section.
- `app` content (new): an explanatory paragraph and two toggle rows + a save button. Mirror the `edit-patient-form` toggle-button style (a `Button variant={on ? 'default':'outline'}` with `aria-pressed`, toggling `form.setValue(name, !on, { shouldDirty: true })`) and the aliased shadcn Tooltip from `bioimpedance-section.tsx` (`Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger` from `@/components/ui/tooltip`) + `Info` from `lucide-react`:
```tsx
<TabsContent value="app">
  <section className="space-y-4 rounded-xl border bg-card p-5">
    <h2 className="font-heading text-base font-bold">Aplicativo Paciente</h2>
    <p className="text-sm text-muted-foreground">
      Estas são configurações padrão aplicadas a novos pacientes. Você pode alterá-las
      individualmente na página de detalhes de cada paciente.
    </p>
    {/* one row per default: label + Info tooltip + toggle button */}
    {/* defaultCanLogAssessments — tooltip: "Se ligado, novos pacientes poderão registrar a própria bioimpedância pelo app." */}
    {/* defaultShowMealTargetToPatient — tooltip: "Se ligado, novos pacientes verão a meta nutricional (calorias e macros) no app." */}
    <div className="flex justify-end">
      <Button type="submit" className="rounded-full" disabled={update.isPending}>Salvar</Button>
    </div>
  </section>
</TabsContent>
```
Each toggle row (write the concrete JSX for both fields):
```tsx
<div className="flex items-center justify-between gap-3 rounded-xl border p-3">
  <div className="flex min-w-0 items-center gap-1.5">
    <p className="text-sm font-medium">Permitir registrar bioimpedância</p>
    <TooltipProvider>
      <UiTooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground" aria-label="Sobre esta configuração">
            <Info className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent>Se ligado, novos pacientes poderão registrar a própria bioimpedância pelo app.</TooltipContent>
      </UiTooltip>
    </TooltipProvider>
  </div>
  <Button
    type="button"
    size="sm"
    variant={form.watch('defaultCanLogAssessments') ? 'default' : 'outline'}
    className="shrink-0 rounded-full"
    aria-pressed={Boolean(form.watch('defaultCanLogAssessments'))}
    onClick={() => form.setValue('defaultCanLogAssessments', !form.watch('defaultCanLogAssessments'), { shouldDirty: true })}
  >
    {form.watch('defaultCanLogAssessments') ? 'Ligado ✓' : 'Desligado'}
  </Button>
</div>
```
(Repeat for `defaultShowMealTargetToPatient` with label "Mostrar a meta nutricional no app" + its tooltip text.)

- [ ] **Step 3: edit-patient-form — the per-patient meta toggle**

In `apps/web/src/components/patients/edit-patient-form.tsx` (**double quotes**): `defaults()` reads `p.canLogAssessments` — add `showMealTargetToPatient: p.showMealTargetToPatient` (and add the field to the form values type/schema this form uses). Add a second toggle row after the "Bioimpedância no app" row, identical in structure, bound to `showMealTargetToPatient`:
```tsx
const showMeta = form.watch("showMealTargetToPatient");
// ...row...
<div className="flex items-center justify-between gap-3 rounded-xl border p-3">
  <div className="min-w-0">
    <p className="text-sm font-medium">Meta no app</p>
    <p className="text-xs text-muted-foreground">Mostrar a meta nutricional no app do paciente.</p>
  </div>
  <Button
    type="button" size="sm"
    variant={showMeta ? "default" : "outline"}
    className="shrink-0 rounded-full"
    aria-pressed={Boolean(showMeta)}
    onClick={() => form.setValue("showMealTargetToPatient", !showMeta, { shouldDirty: true })}
  >
    {showMeta ? "Visível: meta no app ✓" : "Mostrar meta no app"}
  </Button>
</div>
```
The submit already sends `values` via `update.mutateAsync` (`UpdatePatientRequest` now carries `showMealTargetToPatient`).

- [ ] **Step 4: Fixtures + tests**

- `grep -rl "canLogAssessments" apps/web/src` and any `NutritionistSettings` mock — add `showMealTargetToPatient` to every `PatientSummary`/`PatientDetail` literal and `defaultCanLogAssessments`/`defaultShowMealTargetToPatient` to every `NutritionistSettings` literal (tsc will list the rest).
- `settings-view.test.tsx`: assert the 3 tabs render; switching to "Aplicativo Paciente" shows the explanatory text + the two toggles; toggling + saving calls the update mutation with the 2 booleans in the body.
- `edit-patient-form.test.tsx`: assert the "Mostrar meta no app" toggle renders and the update body includes `showMealTargetToPatient`.

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter @nutri-plus/web test` (green) + `pnpm --filter @nutri-plus/web exec tsc --noEmit` (exit 0). Commit (`feat(web): settings tabs + Aplicativo Paciente defaults + patient meta toggle`).

---

### Task 4: Mobile — "Sua meta" card on the evolution home

**Files:** `apps/mobile/lib/queries/nutrition-target.ts` (new), `apps/mobile/app/(app)/index.tsx`; test `apps/mobile/app/(app)/index.test.tsx`.

- [ ] **Step 1: Data layer**

Create `apps/mobile/lib/queries/nutrition-target.ts` (mirror `useMyEvolution` in `lib/queries/assessments.ts`):
```ts
import { useQuery } from '@tanstack/react-query';
import type { MyNutritionTarget } from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

export function getMyNutritionTarget(): Promise<MyNutritionTarget | null> {
  return apiFetch<MyNutritionTarget | null>('/me/nutrition-target');
}

export function useMyNutritionTarget() {
  return useQuery({ queryKey: ['me', 'nutrition-target'], queryFn: getMyNutritionTarget });
}
```

- [ ] **Step 2: "Sua meta" card**

In `apps/mobile/app/(app)/index.tsx`, call `const targetQuery = useMyNutritionTarget();` and, near the top of the evolution content (after the greeting, before/near the snapshot), render the card only when data exists:
```tsx
{targetQuery.data ? (
  <View className="gap-2 rounded-xl border border-border bg-card p-4">
    <Text className="font-sans text-sm text-muted-foreground">Sua meta diária</Text>
    <Text className="font-heading text-2xl text-foreground">
      {targetQuery.data.targetCalories.toLocaleString('pt-BR')} kcal
    </Text>
    <View className="flex-row flex-wrap gap-x-4 gap-y-1">
      <Text className="font-sans text-sm text-foreground">Proteína {targetQuery.data.proteinGrams} g</Text>
      <Text className="font-sans text-sm text-foreground">Carboidrato {targetQuery.data.carbGrams} g</Text>
      <Text className="font-sans text-sm text-foreground">Gordura {targetQuery.data.fatGrams} g</Text>
    </View>
  </View>
) : null}
```
(If `targetQuery.data` is `null`/undefined, nothing renders.)

- [ ] **Step 3: Test**

In `index.test.tsx`, mock `../../lib/queries/nutrition-target` (`useMyNutritionTarget`): a case returning `{ targetCalories: 2000, proteinGrams: 144, carbGrams: 231, fatGrams: 56 }` → assert "Sua meta diária" + "2.000 kcal" + "Proteína 144 g" render; a case returning `null` → assert "Sua meta diária" is absent. Keep the existing `useMyEvolution` mock (add the new mock alongside it).

- [ ] **Step 4: Verify + commit**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (exit 0) + `pnpm --filter @nutri-plus/mobile test` (green). Commit (`feat(mobile): 'Sua meta' card on the evolution home`).

---

## Final verification

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile exec tsc --noEmit && pnpm --filter @nutri-plus/mobile test
```

Manual: Configurações → 3 tabs; "Aplicativo Paciente" shows the explanatory text + 2 toggles with tooltips, saving persists. Create a new patient → it inherits the current defaults. On a patient detail, toggle "Mostrar meta no app" → saved per-patient. In the patient mobile app, the "Sua meta" card appears only when that patient has the toggle on and a saved target, showing kcal + P/C/G only.
