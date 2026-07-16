# Assessment Fields: Muscle/Lean as % + Expanded Circumferences — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show massa muscular & massa magra as a percentage (replacing kg in the UI) and expand the anthropometric circumference set, across the data model, both entry forms, and all three display surfaces.

**Architecture:** Additive data-model change (5 new columns; kg + old circumference columns preserved). The API DTO stays additive so the live iOS app keeps working. Forms/validation/display switch to the new %/circumference fields.

**Tech Stack:** Prisma (API), NestJS class-validator, react-hook-form + zod (web & mobile), pdfmake (PDF), `@nutri-plus/shared-types`.

## Global Constraints

- Same branch `feat/plan-photo-ai-adjust-evolution-pdf` (extends open PR #39).
- NO new dependencies. pt-BR copy. Match each file's quote style (api/mobile single quotes; web mixed — match the file).
- **KEEP `muscleMass`/`leanMass` in the DB, the API DTO, and shared-types** (live iOS app backward-compat + data preservation). Only forms/validation/display switch to %. Never drop or rename existing columns.
- Additive migration on the shared dev DB: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name assessment-percent-and-circumferences`.
- shared-types rebuilt after edits (`pnpm --filter @nutri-plus/shared-types build`).
- API tests use **Jest** (no `vitest` import).
- Do NOT push/PR unless asked. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Verify per area: web `pnpm --filter @nutri-plus/web test` + `pnpm --filter @nutri-plus/web exec tsc --noEmit`; API `pnpm --filter @nutri-plus/api test`; mobile `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` + `pnpm --filter @nutri-plus/mobile test`; shared-types `build`.

**New fields (added everywhere; all `Float?` / `number`):** `muscleMassPercentage`, `leanMassPercentage`, `abdomenCircumference`, `contractedArmCircumference`, `calfCircumference`.

**UI label map (labels only — DB column names unchanged):** `muscleMassPercentage`→"Massa muscular (%)", `leanMassPercentage`→"Massa magra (%)", `waistCircumference`→"Cintura (cm)", `abdomenCircumference`→"Abdômen (cm)", `hipCircumference`→"Quadril (cm)", `thighCircumference`→"Coxa medial (cm)", `armCircumference`→"Braço relaxado (cm)", `contractedArmCircumference`→"Braço contraído (cm)", `chestCircumference`→"Busto (cm)", `calfCircumference`→"Panturrilha (cm)".

**Build order:** Task 1 (foundation) first; Tasks 2–6 depend on it and are otherwise independent.

---

### Task 1: Foundation — schema migration + shared-types + API DTO

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`BodyAssessment`)
- Create: `apps/api/prisma/migrations/**` (via migrate)
- Modify: `packages/shared-types/src/v1/assessment.ts`
- Modify: `apps/api/src/patients/dto/create-assessment.dto.ts`

**Interfaces:**
- Produces: 5 new nullable columns + the same fields on `BodyAssessment` (read) and `CreateAssessmentRequest` (write), plus DTO validators. `UpdateAssessmentDto extends CreateAssessmentDto {}` inherits automatically — do not edit it.

No unit test (schema + type + additive-validator change); the gate is: migration applies, shared-types builds, and the API suite stays green.

- [ ] **Step 1: Add the 5 columns to `BodyAssessment`**

In `schema.prisma`, add the two percentage fields right after `leanMass` and the three circumference fields right after `thighCircumference`:

```prisma
  weight              Float?
  bodyFatPercentage   Float?
  muscleMass          Float?
  leanMass            Float?
  muscleMassPercentage Float?
  leanMassPercentage   Float?
  visceralFat         Float?
  basalMetabolicRate  Float?
  bodyWaterPercentage Float?
  boneMass            Float?
  metabolicAge        Int?

  waistCircumference  Float?
  hipCircumference    Float?
  chestCircumference  Float?
  armCircumference    Float?
  thighCircumference  Float?
  abdomenCircumference       Float?
  contractedArmCircumference Float?
  calfCircumference          Float?
```

- [ ] **Step 2: Create + apply the migration**

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name assessment-percent-and-circumferences`
Expected: a new migration folder with `ADD COLUMN` statements for all five, applied to the dev DB, Prisma client regenerated. If `migrate dev` does not auto-run generate, run `pnpm --filter @nutri-plus/api exec prisma generate`.

- [ ] **Step 3: Add the fields to shared-types**

In `packages/shared-types/src/v1/assessment.ts`, add to **`BodyAssessment`** (after `leanMass` and after `thighCircumference`) and to **`CreateAssessmentRequest`** (matching spots). Keep `muscleMass`/`leanMass`.

`BodyAssessment` additions:
```ts
  muscleMassPercentage: number | null;
  leanMassPercentage: number | null;
```
(after `leanMass`), and
```ts
  abdomenCircumference: number | null;
  contractedArmCircumference: number | null;
  calfCircumference: number | null;
```
(after `thighCircumference`).

`CreateAssessmentRequest` additions:
```ts
  muscleMassPercentage?: number;
  leanMassPercentage?: number;
```
(after `leanMass?`), and
```ts
  abdomenCircumference?: number;
  contractedArmCircumference?: number;
  calfCircumference?: number;
```
(after `thighCircumference?`). `UpdateAssessmentRequest = CreateAssessmentRequest` is unchanged.

- [ ] **Step 4: Build shared-types**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: exit 0.

- [ ] **Step 5: Add the 5 DTO validators (keep kg)**

In `apps/api/src/patients/dto/create-assessment.dto.ts`, add these five properties (place the two % after `leanMass`, the three circumferences after `thighCircumference`). Keep `muscleMass`/`leanMass` exactly as they are.

```ts
  @IsOptional()
  @IsNumber()
  @Min(0)
  muscleMassPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leanMassPercentage?: number;
```

```ts
  @IsOptional()
  @IsNumber()
  @Min(0)
  abdomenCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  contractedArmCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  calfCircumference?: number;
```

- [ ] **Step 6: Run the API suite — expect PASS**

Run: `pnpm --filter @nutri-plus/api test`
Expected: green (the DTO change is purely additive; existing assessment specs still pass).

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/shared-types/src/v1/assessment.ts apps/api/src/patients/dto/create-assessment.dto.ts
git commit -m "feat: assessment muscle/lean % + new circumference fields (schema, types, DTO)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Web entry form (zod + assessment dialog)

**Files:**
- Modify: `apps/web/src/lib/validation/assessment.ts`
- Modify: `apps/web/src/components/patients/assessment-dialog.tsx`
- Test: `apps/web/src/components/patients/assessment-dialog.test.tsx`

**Interfaces:**
- Consumes: the new `AssessmentValues` keys (from the zod schema below).

- [ ] **Step 1: Update the web zod schema**

In `apps/web/src/lib/validation/assessment.ts`: in `NUMERIC_KEYS`, remove `'muscleMass'` and `'leanMass'`, and add `'muscleMassPercentage'`, `'leanMassPercentage'`, `'abdomenCircumference'`, `'contractedArmCircumference'`, `'calfCircumference'`. In the `z.object`, remove the `muscleMass`/`leanMass` lines and add:

```ts
    muscleMassPercentage: optNonNegative,
    leanMassPercentage: optNonNegative,
```
(where `muscleMass`/`leanMass` were), and

```ts
    abdomenCircumference: optNonNegative,
    contractedArmCircumference: optNonNegative,
    calfCircumference: optNonNegative,
```
(after `thighCircumference`). Keep the `.refine('Informe ao menos uma métrica', path ['weight'])`.

- [ ] **Step 2: Update the dialog's field arrays**

In `assessment-dialog.tsx`, replace the `COMPOSITION` and `CIRCUMFERENCES` arrays:

```tsx
const COMPOSITION: NumField[] = [
  { name: 'weight', label: 'Peso (kg)' },
  { name: 'bodyFatPercentage', label: '% Gordura' },
  { name: 'muscleMassPercentage', label: 'Massa muscular (%)' },
  { name: 'leanMassPercentage', label: 'Massa magra (%)' },
  { name: 'visceralFat', label: 'Gordura visceral' },
  { name: 'basalMetabolicRate', label: 'TMB (kcal)' },
  { name: 'bodyWaterPercentage', label: '% Água' },
  { name: 'boneMass', label: 'Massa óssea (kg)' },
  { name: 'metabolicAge', label: 'Idade metabólica' },
];

const CIRCUMFERENCES: NumField[] = [
  { name: 'waistCircumference', label: 'Cintura (cm)' },
  { name: 'abdomenCircumference', label: 'Abdômen (cm)' },
  { name: 'hipCircumference', label: 'Quadril (cm)' },
  { name: 'thighCircumference', label: 'Coxa medial (cm)' },
  { name: 'armCircumference', label: 'Braço relaxado (cm)' },
  { name: 'contractedArmCircumference', label: 'Braço contraído (cm)' },
  { name: 'chestCircumference', label: 'Busto (cm)' },
  { name: 'calfCircumference', label: 'Panturrilha (cm)' },
];
```

`defaults()` iterates `NUM_NAMES` generically by key, so it needs no other change.

- [ ] **Step 3: Update the dialog test**

In `assessment-dialog.test.tsx`, update any query/fixture that used the kg labels or `muscleMass`/`leanMass`: change label queries `'Massa muscular (kg)'`→`'Massa muscular (%)'` and `'Massa magra (kg)'`→`'Massa magra (%)'`; if a fixture `BodyAssessment` sets `muscleMass`/`leanMass`, add `muscleMassPercentage`/`leanMassPercentage` (and the 3 new circumference fields — they are non-optional on `BodyAssessment`, so any typed `BodyAssessment` fixture must include them, e.g. `abdomenCircumference: null, contractedArmCircumference: null, calfCircumference: null`). Add one assertion that a new field renders, e.g. `expect(screen.getByLabelText('Abdômen (cm)')).toBeInTheDocument()` (adjust to the file's query style).

- [ ] **Step 4: Run web editor/dialog tests + tsc — expect PASS**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/assessment-dialog.test.tsx"` then `cd apps/web && pnpm exec tsc --noEmit`
Expected: pass; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/validation/assessment.ts apps/web/src/components/patients/assessment-dialog.tsx apps/web/src/components/patients/assessment-dialog.test.tsx
git commit -m "feat(web): assessment form — muscle/lean % + expanded circumferences

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Mobile entry form (zod + nova-medicao)

**Files:**
- Modify: `apps/mobile/lib/validation/assessment.ts`
- Modify: `apps/mobile/app/(app)/nova-medicao.tsx`
- Test: `apps/mobile/app/(app)/nova-medicao.test.tsx`

**Interfaces:**
- Consumes: mobile `AssessmentValues` (its own zod, identical structure to web).

- [ ] **Step 1: Update the mobile zod schema**

`apps/mobile/lib/validation/assessment.ts` is structurally identical to the web one. Apply the same edit: in `NUMERIC_KEYS` remove `'muscleMass'`/`'leanMass'`, add `'muscleMassPercentage'`, `'leanMassPercentage'`, `'abdomenCircumference'`, `'contractedArmCircumference'`, `'calfCircumference'`; in the `z.object` replace the `muscleMass`/`leanMass` lines with `muscleMassPercentage: optNonNegative,` / `leanMassPercentage: optNonNegative,` and add `abdomenCircumference: optNonNegative,` / `contractedArmCircumference: optNonNegative,` / `calfCircumference: optNonNegative,` after `thighCircumference`.

- [ ] **Step 2: Update the mobile form's `FIELDS`**

In `nova-medicao.tsx`, replace the `FIELDS` array so it mirrors the web set/order/labels:

```tsx
const FIELDS: { key: keyof AssessmentValues; label: string }[] = [
  { key: 'weight', label: 'Peso (kg)' },
  { key: 'bodyFatPercentage', label: '% Gordura' },
  { key: 'muscleMassPercentage', label: 'Massa muscular (%)' },
  { key: 'leanMassPercentage', label: 'Massa magra (%)' },
  { key: 'visceralFat', label: 'Gordura visceral' },
  { key: 'basalMetabolicRate', label: 'TMB (kcal)' },
  { key: 'bodyWaterPercentage', label: '% Água' },
  { key: 'boneMass', label: 'Massa óssea (kg)' },
  { key: 'metabolicAge', label: 'Idade metabólica' },
  { key: 'waistCircumference', label: 'Cintura (cm)' },
  { key: 'abdomenCircumference', label: 'Abdômen (cm)' },
  { key: 'hipCircumference', label: 'Quadril (cm)' },
  { key: 'thighCircumference', label: 'Coxa medial (cm)' },
  { key: 'armCircumference', label: 'Braço relaxado (cm)' },
  { key: 'contractedArmCircumference', label: 'Braço contraído (cm)' },
  { key: 'chestCircumference', label: 'Busto (cm)' },
  { key: 'calfCircumference', label: 'Panturrilha (cm)' },
];
```

- [ ] **Step 3: Update the mobile form test**

In `nova-medicao.test.tsx`, update any label/fixture referencing `muscleMass`/`leanMass` kg to the new `%` labels/keys (same style as the file). If a test submits a payload and asserts fields, switch `muscleMass`/`leanMass` → `muscleMassPercentage`/`leanMassPercentage`.

- [ ] **Step 4: Run mobile tsc + form test — expect PASS**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` then `pnpm --filter @nutri-plus/mobile test -- nova-medicao`
Expected: tsc clean; test passes.

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/lib/validation/assessment.ts" "apps/mobile/app/(app)/nova-medicao.tsx" "apps/mobile/app/(app)/nova-medicao.test.tsx"
git commit -m "feat(mobile): self-log form — muscle/lean % + expanded circumferences

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Web bioimpedance display (%)

**Files:**
- Modify: `apps/web/src/components/patients/bioimpedance-section.tsx`
- Test: `apps/web/src/components/patients/bioimpedance-section.test.tsx`

**Interfaces:**
- Consumes: `BodyAssessment.muscleMassPercentage`/`leanMassPercentage`.

- [ ] **Step 1: Switch the metric/summary/table to the % fields**

In `bioimpedance-section.tsx`:
- `MetricKey` type union: replace `'muscleMass'`/`'leanMass'` with `'muscleMassPercentage'`/`'leanMassPercentage'`.
- `METRICS`: change the two entries to `{ key: 'muscleMassPercentage', label: 'Massa muscular (%)' }` and `{ key: 'leanMassPercentage', label: 'Massa magra (%)' }` (keep their positions; the other 7 metrics unchanged).
- `SUMMARY`: change the `leanMass` entry to `{ key: 'leanMassPercentage', label: 'Massa magra (%)' }`.
- History table body: the "Músculo"/"Magra" cells read `a.muscleMassPercentage`/`a.leanMassPercentage`; relabel the two `<th>` headers to `% Músc.` / `% Magra`. Do NOT add the new circumference columns here (keep the summary table compact).

- [ ] **Step 2: Update the bioimpedance test**

In `bioimpedance-section.test.tsx`: the `assessment()` fixture / any typed `BodyAssessment` must include the new non-optional fields (`muscleMassPercentage`, `leanMassPercentage`, `abdomenCircumference`, `contractedArmCircumference`, `calfCircumference`); set the muscle/lean fixture values on the `%` fields so the metric-switch and table tests still assert real values; update any header/label query from `Músculo`/`Magra`/`Massa muscular`/`Massa magra` to the `%` labels used above.

- [ ] **Step 3: Run the bioimpedance test + tsc — expect PASS**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/bioimpedance-section.test.tsx"` then `cd apps/web && pnpm exec tsc --noEmit`
Expected: pass; tsc clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/patients/bioimpedance-section.tsx apps/web/src/components/patients/bioimpedance-section.test.tsx
git commit -m "feat(web): bioimpedance shows muscle/lean as %

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Evolution PDF (% + new circumferences)

**Files:**
- Modify: `apps/api/src/patients/pdf/evolution-doc.ts`
- Test: `apps/api/src/patients/pdf/evolution-doc.spec.ts`

**Interfaces:**
- Consumes: the new fields on the incoming assessments (the service passes `BodyAssessment[]`, which now carries them).

- [ ] **Step 1: Extend `EvolutionAssessment` + chart/table to the new fields**

In `evolution-doc.ts`:

Add to the `EvolutionAssessment` interface (after `leanMass` and after `thighCircumference`):
```ts
  muscleMassPercentage: number | null;
  leanMassPercentage: number | null;
```
```ts
  abdomenCircumference: number | null;
  contractedArmCircumference: number | null;
  calfCircumference: number | null;
```

`CHART_METRICS`: change the muscle/lean entries to:
```ts
  { key: 'muscleMassPercentage', label: 'Massa muscular (%)' },
  { key: 'leanMassPercentage', label: 'Massa magra (%)' },
```

`compositionTable`: relabel the two headers and read the % fields:
- header row `th('M.Musc')`→`th('% Músc')`, `th('M.Magra')`→`th('% Magra')`.
- body cells `fmtNum(a.muscleMass)`→`fmtNum(a.muscleMassPercentage)`, `fmtNum(a.leanMass)`→`fmtNum(a.leanMassPercentage)`.

`circumferenceTable`: replace the header + body with the new 8-measurement set (9 columns; keep `fontSize: 8`, widths all `'*'`):
```ts
  const body: TableCell[][] = [
    [th('Data'), th('Cintura'), th('Abdômen'), th('Quadril'), th('Coxa med.'), th('Braço rel.'), th('Braço contr.'), th('Busto'), th('Pantur.')],
  ];
  assessments.forEach((a) => {
    body.push([
      { text: fmtDate(a.assessmentDate) },
      { text: fmtNum(a.waistCircumference) },
      { text: fmtNum(a.abdomenCircumference) },
      { text: fmtNum(a.hipCircumference) },
      { text: fmtNum(a.thighCircumference) },
      { text: fmtNum(a.armCircumference) },
      { text: fmtNum(a.contractedArmCircumference) },
      { text: fmtNum(a.chestCircumference) },
      { text: fmtNum(a.calfCircumference) },
    ]);
  });
  return {
    table: { headerRows: 1, widths: Array(9).fill('*'), body },
    layout: 'lightHorizontalLines',
    fontSize: 8,
    margin: [0, 0, 0, 6],
  } as Content;
```

- [ ] **Step 2: Update the spec fixtures + assertions**

In `evolution-doc.spec.ts`, add the 5 new fields to each object in the `rows` fixture (they are now required on `EvolutionAssessment`), e.g. `muscleMassPercentage: 40, leanMassPercentage: 55, abdomenCircumference: 85, contractedArmCircumference: 34, calfCircumference: 38` on the first row and different values on the second. Keep the existing weight-chart assertion (`>80<`/`>78<` — weight is unchanged). Update the composition-table expectation if it asserts `M.Musc`/`M.Magra` text (now `% Músc`/`% Magra`). Add an assertion that the circumference table includes an `Abdômen` header (e.g. the doc JSON contains `'Abdômen'`). Keep the render smoke test (`renderPdf` → `%PDF-`) — it now also renders the wider circumference table.

- [ ] **Step 3: Run the spec — expect PASS**

Run: `pnpm --filter @nutri-plus/api test -- evolution-doc`
Expected: pass (svg chart, unbreakable stacks, `% Músc`/`% Magra`, `Abdômen` column, render smoke `%PDF-`).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/patients/pdf/evolution-doc.ts apps/api/src/patients/pdf/evolution-doc.spec.ts
git commit -m "feat(api): evolution PDF uses muscle/lean % + expanded circumference table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Mobile evolution display (% tile + expanded details grid)

**Files:**
- Modify: `apps/mobile/app/(app)/index.tsx`
- Test: `apps/mobile/app/(app)/index.test.tsx`

**Interfaces:**
- Consumes: `BodyAssessment.muscleMassPercentage`/`leanMassPercentage` + the new circumference fields.

- [ ] **Step 1: Switch the muscle tile to % and expand the details grid**

In `index.tsx`:
- The `Metric` type is `keyof Pick<BodyAssessment, 'weight' | 'bodyFatPercentage' | 'muscleMass'>` — change `'muscleMass'` to `'muscleMassPercentage'`.
- `METRICS`: change the muscle entry to `{ key: 'muscleMassPercentage', label: 'Massa muscular', unit: '%', trendLabel: 'Massa muscular (%)' }`.
- The `grid` array (details of the latest assessment): relabel and extend to:
```tsx
  const grid: { label: string; value: string }[] = [
    { label: 'Massa magra (%)', value: fmt(latest.leanMassPercentage) },
    { label: 'Gordura visceral', value: fmt(latest.visceralFat, 0) },
    { label: 'Taxa metabólica basal', value: fmt(latest.basalMetabolicRate, 0) },
    { label: 'Água corporal (%)', value: fmt(latest.bodyWaterPercentage) },
    { label: 'Massa óssea (kg)', value: fmt(latest.boneMass) },
    { label: 'Idade metabólica', value: fmt(latest.metabolicAge, 0) },
    { label: 'Cintura (cm)', value: fmt(latest.waistCircumference) },
    { label: 'Abdômen (cm)', value: fmt(latest.abdomenCircumference) },
    { label: 'Quadril (cm)', value: fmt(latest.hipCircumference) },
    { label: 'Coxa medial (cm)', value: fmt(latest.thighCircumference) },
    { label: 'Braço relaxado (cm)', value: fmt(latest.armCircumference) },
    { label: 'Braço contraído (cm)', value: fmt(latest.contractedArmCircumference) },
    { label: 'Busto (cm)', value: fmt(latest.chestCircumference) },
    { label: 'Panturrilha (cm)', value: fmt(latest.calfCircumference) },
  ];
```

- [ ] **Step 2: Update the mobile evolution test**

In `index.test.tsx`, the `two`/data fixture objects are `BodyAssessment`-shaped — add the 5 new fields (`muscleMassPercentage`, `leanMassPercentage`, `abdomenCircumference`, `contractedArmCircumference`, `calfCircumference`) to each; set `muscleMassPercentage` where the test asserts the muscle tile/trend so those assertions still hold; if a test asserts the `78,0`/muscle value, move it to the `%` field as needed.

- [ ] **Step 3: Run mobile tsc + evolution test — expect PASS**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` then `pnpm --filter @nutri-plus/mobile test -- index`
Expected: tsc clean; test passes.

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/app/(app)/index.tsx" "apps/mobile/app/(app)/index.test.tsx"
git commit -m "feat(mobile): evolution screen — muscle % tile + expanded circumference details

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test
pnpm --filter @nutri-plus/web test
pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
pnpm --filter @nutri-plus/mobile test
```

Manual (optional, shared dev DB): create an assessment with muscle/lean % + the new circumferences → they persist, show in the web bioimpedance section and the mobile evolution screen, and appear in the exported evolution PDF (composition uses %, circumference table lists the 8-measurement set). Confirm the live-app path still works: a payload containing `muscleMass`/`leanMass` (kg) is still accepted by `POST /v1/me/assessments` (not rejected).
