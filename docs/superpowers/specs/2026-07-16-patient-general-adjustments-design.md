# Patient General Adjustments — Design

**Date:** 2026-07-16
**Branch:** `feat/patient-general-adjustments` (off main; PR #41 merged)
**Status:** Approved design — ready for implementation plan

A batch of six independent UI/calculation adjustments across the nutritionist web
app and the evolution PDF. No new features — refinements. One additive API/shared-types
change (computed `imc`), no DB migration.

## Decisions (from brainstorming)

- **IMC display:** number **+ WHO classification** (Abaixo do peso / Peso normal /
  Sobrepeso / Obesidade), in both the listing column and the detail card.
- **PDF:** keep **A4 portrait**; moderate font increase (the 11-column
  circumference table grows less, to avoid overflowing the page width).
- **Percentage→kg (item 3):** applies to **all** percentage measures, framed as an
  experiment that may change/be removed later.

## Global Constraints

- NO new dependencies. pt-BR copy. Match each file's quote style (web is mixed —
  match the file). API + mobile tests = **Jest**; web = **vitest**.
- Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT
  push/PR unless asked. No DB migration (IMC is computed, not stored).

---

## 1. Remove-photo button label (web)

`apps/web/src/components/patients/patient-detail.tsx` — the photo remove button
reads only `Remover`, which could be confused with removing the patient. Change the
text to **"Remover foto"** and add `aria-label="Remover foto do paciente"`.

## 2. Computed IMC — listing column + detail card

BMI = `weight / (height_m)²`, using `PatientProfile.height` (cm) + the **latest**
recorded assessment's `weight`.

- **API** (`apps/api/src/patients/patients.service.ts`): add a pure helper
  `computeImc(height: number | null, weightKg: number | null): number | null`
  returning `round1(weightKg / (height/100)²)` when both are present and `> 0`,
  else `null`. Apply it in:
  - `listPatients` — the list `findMany` currently includes only `user`; add
    `assessments: { orderBy: { assessmentDate: 'desc' }, take: 1 }`, then map each
    item to `{ ...item, imc }` (computed from `height` + `assessments[0]?.weight`)
    **without** exposing `assessments` on the list item (PatientSummary has none).
  - `getPatient` / `updatePatient` — already include the latest assessment; attach
    `imc` computed from `height` + `assessments[0]?.weight`. `PatientDetail` keeps
    `assessments` **and** gains `imc`.
  - A shared private helper keeps the mapping DRY.
- **shared-types** (`packages/shared-types/src/v1/patient.ts`): add
  `imc: number | null` to `PatientSummary` (inherited by `PatientDetail`). Rebuild.
- **Web**:
  - New `imcCategory(imc: number | null): string | null` util (pt-BR WHO bands:
    `< 18.5` Abaixo do peso; `18.5–24.9` Peso normal; `25–29.9` Sobrepeso;
    `≥ 30` Obesidade). Value formatting: `24,2 · Peso normal`; `—` when `imc` is null.
  - `patients-list.tsx` — new **"IMC"** column rendering `imc` + category.
  - `patient-detail.tsx` — new **"IMC" card** near the header rendering `imc` +
    category (reads `patient.imc`, no extra fetch).
- **Fixtures:** every test that constructs a `PatientSummary`/`PatientDetail` literal
  must add `imc` (e.g. `imc: null` or a value where asserting the column/card).

## 3. Percentage measures → real kg value (experimental)

Helper `kgFromPercent(weightKg, pct)` = `round1(weightKg * pct / 100)` when both
present, else `null`. The kg uses the **same assessment's** weight (for displays) or
the **currently entered** weight (for the input hint).

- **Displays** (`bioimpedance-section.tsx`):
  - Summary cards for `bodyFatPercentage` and `leanMassPercentage` gain a small gray
    sub-line `≈ X kg` from `latest.weight`.
  - History table `%` columns (`% Gord.`, `% Músc.`, `% Magra`) show the kg in gray
    beneath/next to the percentage, per row, using that row's `weight`.
- **Inputs** (`assessment-dialog.tsx`): the four percentage fields
  (`bodyFatPercentage`, `muscleMassPercentage`, `leanMassPercentage`,
  `bodyWaterPercentage`) get a **gray suffix hint** `≈ X kg`, computed live from the
  current `weight` field (react-hook-form `watch`). Hint hidden when weight or the %
  is empty/invalid.
- An in-code comment marks this as an experiment (may change/be removed).

## 4. Evolution PDF — larger table + text (portrait)

`apps/api/src/patients/pdf/evolution-doc.ts` — keep A4 portrait; raise font sizes for
readability:
- `defaultStyle` 9 → **11**; `title` 16 → **18**; `section` 12 → **14**;
  `brand` 14 → **16**; `chartLabel` 10 → **11**; `muted` 9 → **10**; `th` 8 → **10**.
- Composition table (**11 columns**, `auto` widths — the overflow risk): `fontSize`
  8 → **9** (smaller bump so 11 columns still fit A4 portrait width).
- Circumference table (**9 columns**, `*` widths — distributes to fit): `fontSize`
  8 → **10**.
- Update `evolution-doc.spec.ts` assertions that pin font sizes.
- Verify the generated PDF does not overflow the page width (the 11-col table is the
  risk); keep the circumference table's bump conservative if needed.

## 5. "Exportar evolução" visible on any patient tab

`patient-detail.tsx` + `bioimpedance-section.tsx` — move the export button and its
logic (`onExport`, `exporting` state, `downloadAssessmentsPdf`) out of the
bioimpedance tab and into the **patient-detail header**, so it is visible regardless
of the active tab. The header calls `useAssessments(id)` to disable the button when
there are no assessments (react-query shares the cache with `bioimpedance-section`, so
no duplicate request). Remove the export button from `bioimpedance-section.tsx`
(keep "Nova avaliação" there).

## 6. Move "Agenda" to the second menu position

`apps/web/src/components/app/nav-items.ts` — reorder `NAV_ITEMS` to: **Pacientes,
Agenda, Funcionários, Contabilidade, Configurações** (Agenda moves from 3rd to 2nd).

---

## Testing

- **API:** `patients.service` spec — `imc` computed correctly for list + detail
  (value with 1 decimal; `null` when height or weight missing/0). `evolution-doc.spec`
  — updated font-size assertions.
- **shared-types:** `build` clean.
- **Web (vitest):** `patients-list` (IMC column + category + "—"),
  `patient-detail` (IMC card, "Remover foto" label, export button in header),
  `bioimpedance-section` (kg sub-labels on cards + history), `assessment-dialog`
  (kg hint on the 4 % inputs, hidden when weight empty), nav/sidebar (Agenda 2nd).
  Update all `PatientSummary`/`PatientDetail` fixtures with `imc`. `tsc --noEmit` clean.
- **Mobile:** the patient app doesn't use the patient listing/`PatientSummary`; verify
  `tsc --noEmit` + tests still pass after the shared-type change (update any fixture
  that constructs `PatientSummary`/`PatientDetail`).

## File map

- `apps/web/src/components/patients/patient-detail.tsx` — item 1 label, item 2 card, item 5 export button
- `apps/web/src/components/patients/patients-list.tsx` — item 2 column
- `apps/web/src/components/patients/bioimpedance-section.tsx` — item 3 displays, item 5 (remove export)
- `apps/web/src/components/patients/assessment-dialog.tsx` — item 3 input hints
- `apps/web/src/components/app/nav-items.ts` — item 6 order
- `apps/web/src/lib/health/imc.ts` (new) — `imcCategory` (+ optional `kgFromPercent`) web util
- `apps/api/src/patients/patients.service.ts` — item 2 `computeImc` + mapping
- `apps/api/src/patients/pdf/evolution-doc.ts` — item 4 font sizes
- `packages/shared-types/src/v1/patient.ts` — item 2 `imc` field
- Tests alongside each surface.
