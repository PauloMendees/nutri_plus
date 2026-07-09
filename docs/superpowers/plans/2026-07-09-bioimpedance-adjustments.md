# Bioimpedance Self-Log Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three post-test adjustments to the patient self-log bioimpedance feature — hide the mobile form from the tab bar, move its entry button to the end of the Evolução screen, and flag patient-self-logged assessments in the web nutritionist listing.

**Architecture:** A new `loggedByPatient` boolean on `BodyAssessment` (set true only by the patient's `createMyAssessment`) flows through shared-types to the web table, which shows an icon + tooltip. Two mobile-only UI tweaks (tab config + button placement) round it out.

**Tech Stack:** Prisma 7 (API), NestJS, `@nutri-plus/shared-types` (tsc), Next.js + shadcn Tooltip + lucide-react (web), Expo + expo-router Tabs (mobile).

## Global Constraints

- SINGLE quotes in new/edited **api + mobile** files; MATCH the existing **double-quote** style in web files (don't reformat).
- pt-BR user copy — the tooltip text is exactly `Registrado pelo paciente pelo app`.
- Additive migration on the shared dev DB (`prisma migrate dev`); never commit `.env` or `.expo/`.
- Reuse existing primitives (shadcn Tooltip from `@/components/ui/tooltip`; no new mobile UI primitives).
- `loggedByPatient` defaults to `false`.
- No NEW mobile route (nova-medicao already exists) → no `expo customize` regen. Never name a test file `_layout*`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push/PR.
- Verify per layer: API `pnpm --filter @nutri-plus/api test`; shared-types `pnpm --filter @nutri-plus/shared-types build`; web `pnpm --filter @nutri-plus/web test` + `pnpm --filter @nutri-plus/web exec tsc --noEmit`; mobile `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` + `pnpm --filter @nutri-plus/mobile test`. Keep current suites green (API 215, web 285, mobile 104).

---

## Task 1: Data model + shared-types (`loggedByPatient`)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `BodyAssessment`)
- Create (generated): a migration under `apps/api/prisma/migrations/`
- Modify: `packages/shared-types/src/v1/assessment.ts`

**Interfaces:**
- Produces: `BodyAssessment.loggedByPatient: boolean` (DB default false; shared-types field).

- [ ] **Step 1: Add the Prisma field**

In `apps/api/prisma/schema.prisma`, inside `model BodyAssessment`, add after `createdAt DateTime @default(now())` (or alongside the other scalars):

```prisma
  loggedByPatient Boolean  @default(false)
```

- [ ] **Step 2: Create + apply the migration**

Run:
```bash
pnpm --filter @nutri-plus/api exec prisma migrate dev --name assessment_logged_by_patient
```
Expected: a new migration folder with `ALTER TABLE "BodyAssessment" ADD COLUMN "loggedByPatient" BOOLEAN NOT NULL DEFAULT false;`, applied to the shared dev DB.

- [ ] **Step 3: Confirm the generated client (known gotcha)**

`prisma migrate dev` may not regenerate the client. Run:
```bash
pnpm --filter @nutri-plus/api exec prisma generate
```
Then confirm: `grep -rl loggedByPatient apps/api/src/generated/prisma` returns matches.

- [ ] **Step 4: Extend the shared-types interface**

In `packages/shared-types/src/v1/assessment.ts`, add to the `BodyAssessment` interface (after `createdAt: string;`):

```ts
  loggedByPatient: boolean;
```

- [ ] **Step 5: Build shared-types**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/shared-types/src/v1/assessment.ts
git commit -m "feat(db,shared-types): BodyAssessment.loggedByPatient flag

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: API — patient self-log marks `loggedByPatient: true`

**Files:**
- Modify: `apps/api/src/patients/patients.service.ts` (`createMyAssessment`)
- Test: `apps/api/src/patients/patients.service.spec.ts`

**Interfaces:**
- Consumes: `BodyAssessment.loggedByPatient` (Task 1); existing `createMyAssessment(ctx, dto)`, `ctxPatientCanLog(id, canLog)` test helper, `mockDeep<PrismaService>`.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/patients/patients.service.spec.ts`, inside the existing `describe('createMyAssessment', ...)` block, add:

```ts
it('marks the assessment as logged by the patient', async () => {
  const ctx = ctxPatientCanLog('patient-1', true);
  prisma.bodyAssessment.create.mockResolvedValue({ id: 'a1' } as any);
  await service.createMyAssessment(ctx, { weight: 80 } as any);
  expect(prisma.bodyAssessment.create).toHaveBeenCalledWith({
    data: { weight: 80, patientId: 'patient-1', loggedByPatient: true },
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @nutri-plus/api test -- patients.service`
Expected: FAIL — the actual `create` data has no `loggedByPatient`.

- [ ] **Step 3: Implement**

In `apps/api/src/patients/patients.service.ts`, in `createMyAssessment`, change the create call's data from `{ ...dto, patientId }` to:

```ts
    return this.prisma.bodyAssessment.create({
      data: { ...dto, patientId, loggedByPatient: true },
    });
```

Leave `createAssessment` (the nutritionist path) unchanged — it keeps the DB default `false`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nutri-plus/api test`
Expected: PASS — full API suite green (215 + 1 new).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/patients/patients.service.ts apps/api/src/patients/patients.service.spec.ts
git commit -m "feat(api): mark patient self-logged assessments (loggedByPatient)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Web — icon + tooltip on patient-logged rows

**Files:**
- Modify: `apps/web/src/components/patients/bioimpedance-section.tsx`
- Test: `apps/web/src/components/patients/bioimpedance-section.test.tsx`

**Interfaces:**
- Consumes: `BodyAssessment.loggedByPatient` (Task 1); shadcn `@/components/ui/tooltip`; `lucide-react` `Smartphone`.

Note: this file already imports `Tooltip` from **recharts** (the chart tooltip). Import the shadcn one aliased to avoid the name clash.

- [ ] **Step 1: Write the failing test**

In `apps/web/src/components/patients/bioimpedance-section.test.tsx`:

First, add `loggedByPatient: false` to the default returned by the `assessment(over)` helper (so existing rows type-check and default to not-flagged), keeping the `...over` spread last so a test can override it.

Then add:

```ts
it('flags patient-logged rows with an icon + tooltip trigger', () => {
  useAssessments.mockReturnValue({
    data: [assessment({ id: 'a1', loggedByPatient: true })],
    isLoading: false,
    isError: false,
  });
  render(<BioimpedanceSection patientId="p1" />);
  expect(screen.getByLabelText('Registrado pelo paciente')).toBeInTheDocument();
});

it('does not flag nutritionist-logged rows', () => {
  useAssessments.mockReturnValue({
    data: [assessment({ id: 'a1', loggedByPatient: false })],
    isLoading: false,
    isError: false,
  });
  render(<BioimpedanceSection patientId="p1" />);
  expect(screen.queryByLabelText('Registrado pelo paciente')).not.toBeInTheDocument();
});
```

(Match the exact shape the existing tests use to drive `useAssessments` — if they return the array under a different key or call signature, mirror that. The two assertions above only depend on the rendered row.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- bioimpedance-section`
Expected: FAIL — no element labelled "Registrado pelo paciente".

- [ ] **Step 3: Implement**

In `apps/web/src/components/patients/bioimpedance-section.tsx`, add imports (near the other imports, matching double-quote style):

```tsx
import { Smartphone } from "lucide-react";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
```

Replace the date cell:

```tsx
                    <td className="px-4 py-3">{fmtDate(a.assessmentDate)}</td>
```

with:

```tsx
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        {a.loggedByPatient && (
                          <TooltipProvider>
                            <UiTooltip>
                              <TooltipTrigger asChild>
                                <span
                                  aria-label="Registrado pelo paciente"
                                  className="text-muted-foreground"
                                >
                                  <Smartphone className="h-3.5 w-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Registrado pelo paciente pelo app</TooltipContent>
                            </UiTooltip>
                          </TooltipProvider>
                        )}
                        {fmtDate(a.assessmentDate)}
                      </span>
                    </td>
```

- [ ] **Step 4: Run the test + typecheck**

Run: `pnpm --filter @nutri-plus/web test -- bioimpedance-section` → PASS.
Run: `pnpm --filter @nutri-plus/web test` → full web suite green.
Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/patients/bioimpedance-section.tsx apps/web/src/components/patients/bioimpedance-section.test.tsx
git commit -m "feat(web): flag patient-self-logged bioimpedance rows (icon + tooltip)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Mobile — hide the form tab + move the button to the end

**Files:**
- Modify: `apps/mobile/app/(app)/_layout.tsx`
- Modify: `apps/mobile/app/(app)/index.tsx`

**Interfaces:**
- Consumes: existing `nova-medicao` route; the gated `Registrar medição` button.

- [ ] **Step 1: Hide `nova-medicao` from the tab bar**

In `apps/mobile/app/(app)/_layout.tsx`, add this `Tabs.Screen` inside `<Tabs>` (e.g. right after the `configuracoes` screen):

```tsx
      <Tabs.Screen name="nova-medicao" options={{ href: null }} />
```

`href: null` removes it from the tab bar while keeping the route pushable.

- [ ] **Step 2: Move the button to the end of the Evolução main render**

In `apps/mobile/app/(app)/index.tsx`, in the **main render** (not the empty-state branch), delete the button block that currently sits right after the header (`Sua evolução`) `</View>`:

```tsx
        {canLog ? (
          <Button label="Registrar medição" onPress={() => router.push('/nova-medicao')} />
        ) : null}
```

and re-add the identical block as the **last child** of the outer `<View className="gap-6">`, immediately after the `Detalhes da última avaliação` block's closing `</View>`:

```tsx
        <View className="gap-1">
          <Text className="font-heading text-lg text-foreground">Detalhes da última avaliação</Text>
          {grid.map((row) => (
            <GridRow key={row.label} label={row.label} value={row.value} />
          ))}
        </View>

        {canLog ? (
          <Button label="Registrar medição" onPress={() => router.push('/nova-medicao')} />
        ) : null}
      </View>
    </Screen>
```

Leave the empty-state branch's button (`assessments.length === 0`) untouched — it's the only way to log the first measurement.

- [ ] **Step 3: Verify (typecheck + tests)**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` → clean.
Run: `pnpm --filter @nutri-plus/mobile test` → full mobile suite green (the `evolucao-gate` test still finds the `Registrar medição` button — it's still rendered when `canLog`, just at the bottom now).

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/app/(app)/_layout.tsx" "apps/mobile/app/(app)/index.tsx"
git commit -m "feat(mobile): hide nova-medicao tab + move log button to end of Evolução

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (coverage vs spec)

- **#1 hide tab** → Task 4 Step 1 (`href: null`) ✓
- **#2 button to end** → Task 4 Step 2 ✓
- **#3 source tracking** → Task 1 (`loggedByPatient` field + shared-types) + Task 2 (patient create sets true; nutritionist unchanged) ✓
- **#3 web icon + tooltip** → Task 3 (aliased shadcn Tooltip + `Smartphone`, pt-BR text) ✓
- Types consistent: `loggedByPatient: boolean` used identically across schema/shared-types/API/web ✓
- No placeholders; each code step shows the exact edit ✓
