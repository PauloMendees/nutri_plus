# Mobile Evolution — Metric-Selector Trend Charts — Design

**Date:** 2026-07-17
**Branch:** `feat/mobile-evolution-charts` (off main; PR #42 merged)
**Status:** Approved design — ready for implementation plan

Update the patient app's evolution screen so the trend charts cover **all**
body-composition measurements (including the ones added in recent rounds), via a
**metric selector** (chips) + a single chart — mirroring the web bioimpedance UX.

## Already done (no change)

Patient-facing evolution **export already exists and works**: the evolution screen
has an "Exportar PDF" button wired to `downloadEvolutionPdf()`
(`apps/mobile/lib/queries/assessments.ts`), which downloads the authenticated
`GET /v1/me/assessments/pdf` (the same, now-larger, evolution-doc) via
`expo-file-system/legacy` + opens the `expo-sharing` share sheet. This is out of
scope — left untouched.

## The change (mobile only)

File: `apps/mobile/app/(app)/index.tsx`. Today the **"Tendências"** section renders
3 fixed stacked charts (Peso, % Gordura, Massa muscular) from a `METRICS` array; every
other measurement appears only as a static latest-value row in the **"Detalhes"** grid.

Replace the 3 fixed charts with **one `LineChart` + a wrapping chip selector** that
switches which measurement is plotted.

- **Chip selector:** a `flex-wrap` row of pressable chips, one per chartable metric.
  The selected chip is highlighted (primary background / primary-foreground text),
  unselected chips are muted — matching the app's existing tile/button visual language.
  Reuses NativeWind classes already in the file.
- **Default selection:** `weight` ("Peso").
- **Single chart:** reuses the existing `components/chart/line-chart.tsx` `LineChart`.
  Points are built from the selected metric's series: filter out `null`/`undefined`,
  chronological order, `x` = index, `y` = value (same `trend()` shape used today).
- **Insufficient data:** if the selected metric has fewer than 2 points, show the
  existing message "Sem histórico suficiente para tendência ainda." (the current
  `Trend` component already does this — keep that behavior for the single chart).

### Chartable metrics (selector list)

All numeric series that make sense as a trend, keyed off `BodyAssessment` fields plus a
computed IMC. Labels reuse the app's existing wording:

| key | chip label |
|---|---|
| `weight` | Peso |
| `imc` (computed) | IMC |
| `bodyFatPercentage` | % Gordura |
| `muscleMassPercentage` | Massa muscular |
| `leanMassPercentage` | Massa magra |
| `visceralFat` | Gordura visceral |
| `basalMetabolicRate` | TMB |
| `bodyWaterPercentage` | % Água |
| `boneMass` | Massa óssea |
| `metabolicAge` | Idade metabólica |
| `waistCircumference` | Cintura |
| `abdomenCircumference` | Abdômen |
| `hipCircumference` | Quadril |
| `thighCircumference` | Coxa medial |
| `armCircumference` | Braço relaxado |
| `contractedArmCircumference` | Braço contraído |
| `chestCircumference` | Busto |
| `calfCircumference` | Panturrilha |

- **IMC series:** computed per assessment from that assessment's `weight` + the
  patient `height` (both already available: `height` comes from `useMyEvolution()`,
  and the screen already has a `bmi(weight, height)` helper). An assessment with a
  null `weight` (or missing height) contributes no point.

## Unchanged

The headline snapshot **tiles** (Peso, % Gordura, Massa muscular, IMC) and the
**"Detalhes"** grid of latest values stay exactly as they are. Only the "Tendências"
section changes.

## Testing

`apps/mobile/app/(app)/index.test.tsx` (Jest):
- The metric selector renders chips, including the newly-added measurements
  (e.g. "Massa magra", "Abdômen", "Braço contraído", "Panturrilha").
- The chart defaults to the "Peso" series on load.
- Selecting a different chip changes the plotted series (assert the chart re-renders
  with the new metric's data — e.g. via a value label / point count that differs).
- The insufficient-data message shows for a metric with fewer than 2 points.
- Existing tests (export button, estimatedFromPhoto badge, empty state) keep passing.

## Constraints

- NO new dependencies (`react-native-svg` + the existing `LineChart` already present).
- pt-BR copy. Match the file's quote style (mobile uses **single quotes**). Mobile
  tests = **Jest** (never import vitest). Verify `tsc --noEmit` + tests.
- Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT
  push/PR unless asked. Branch `feat/mobile-evolution-charts`.

## File map

- `apps/mobile/app/(app)/index.tsx` — replace the fixed "Tendências" charts with the
  metric-selector + single chart; add the full metric list + IMC-series computation.
- `apps/mobile/app/(app)/index.test.tsx` — selector + switching + insufficient-data tests.
