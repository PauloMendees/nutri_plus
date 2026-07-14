# Plan/Photo/AI/PDF — Round 2 UI Adjustments — Design

**Date:** 2026-07-13
**Branch:** `feat/plan-photo-ai-adjust-evolution-pdf` (extends open PR #39, not yet merged)
**Status:** Approved design — ready for implementation plan

Seven small, isolated UI/UX refinements on top of the PR #39 feature set. No new
dependencies. All user-facing copy pt-BR.

---

## Global Constraints

- Same branch as PR #39 (`feat/plan-photo-ai-adjust-evolution-pdf`); these become additional commits on that PR.
- NO new dependencies.
- Quote style: match each edited file (web is mixed — `meal-plan-editor.tsx` uses double-quote JSX attrs; `bioimpedance-section.tsx`/`patient-detail.tsx`/`patient-avatar.tsx` use single quotes for imports/strings, double for JSX attrs; API `evolution-doc.ts` uses single quotes).
- pt-BR user copy.
- Keep suites green. Verify: web `pnpm --filter @nutri-plus/web test` + `pnpm --filter @nutri-plus/web exec tsc --noEmit`; API `pnpm --filter @nutri-plus/api test`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do NOT push/PR beyond the existing branch unless asked (the branch is already pushed; new commits can be pushed to update PR #39 when the user asks).

**Verified facts:**
- Installed pdfmake is **0.2.23** (`node_modules/.pnpm/pdfmake@0.2.23`), which **bundles `svg-to-pdfkit`** and whose types expose `{ svg: string | SVGElement }` content nodes and `unbreakable?: boolean` + `pageBreakBefore`. So SVG chart nodes and `unbreakable` stacks are available with no new dependency.
- Web theme tokens are **direct hex** CSS vars in `apps/web/src/app/globals.css` (`:root` light + dark override) mapped via `@theme inline` to `--color-*`. Dark values: `--muted-foreground: #8a9a92`, `--border: #243029`. So `var(--muted-foreground)` / `var(--border)` / `var(--card)` / `var(--foreground)` are valid color values usable directly as SVG `fill`/`stroke` / recharts props.

**Suggested task grouping:** (T1) web photo #1+#2 · (T2) web editor width #3 · (T3) web chart #4+#7 · (T4) PDF doc #5+#6.

---

## T1 — Photo upload loading state (#1) + bigger photos (#2)

**File:** `apps/web/src/components/patients/patient-detail.tsx`, `apps/web/src/components/patients/patients-list.tsx`

### #1 loading state
The detail header already computes `const photoPending = uploadPhoto.isPending || deletePhoto.isPending;` and disables the inner file input + Remover button, but there is no visible feedback. Add:
- Wrap the `<PatientAvatar>` in the header in a `relative` container; when `photoPending`, render an absolutely-centered spinner overlay — a lucide `Loader2` with `className='h-5 w-5 animate-spin text-primary'` over a subtle backdrop (`absolute inset-0 flex items-center justify-center rounded-full bg-background/60`).
- While `photoPending`, the upload `<label>` text switches from `Trocar foto`/`Adicionar foto` to `Enviando…`, and the label gets disabled styling (`aria-disabled` + `pointer-events-none opacity-60`) so it reads as in-progress.
- Import `Loader2` from `lucide-react`.

### #2 bigger photos
- `patients-list.tsx`: mobile card avatar `size-9 text-xs` → `size-11 text-sm` (line ~111); desktop table avatar `size-8 text-xs` → `size-10 text-sm` (line ~138).
- `patient-detail.tsx`: header avatar `size-11 text-sm` → `size-16 text-lg`.

### Testing
- `patient-detail.test.tsx`: add a test that when the `useUploadPatientPhoto` mock returns `{ isPending: true }`, the header shows `Enviando…` (and/or the spinner is present). Keep the existing upload test green.
- `patients-list.test.tsx` stays green (only class strings change).

---

## T2 — Meal-plan editor max width (#3)

**File:** `apps/web/src/components/patients/meal-plan-editor.tsx`

Change `max-w-3xl` → `max-w-4xl` at the three wrappers: the loading `Skeleton` (line ~215), the not-found wrapper (line ~219), and the main editor `<div>` (line ~231). Do NOT touch `patient-detail.tsx`'s `max-w-3xl` (that is the patient detail page, not the plan editor).

### Testing
Existing `meal-plan-editor.test.tsx` stays green (class-string-only change; no query depends on the width).

---

## T3 — Export button label (#4) + dark-theme chart legibility (#7)

**File:** `apps/web/src/components/patients/bioimpedance-section.tsx`

### #4 label
Line ~121: `{exporting ? 'Exportando…' : 'Exportar PDF'}` → `{exporting ? 'Exportando…' : 'Exportar evolução'}`.

### #7 dark-theme chart
The trend `LineChart` sets `stroke="var(--muted-foreground)"` on `XAxis`/`YAxis` (colors the axis line) but never sets the tick **text** fill, so tick labels use recharts' default `#666` — illegible on the dark card. Fix:
- `XAxis`: add `tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}` (the existing `fontSize={11}` can move into `tick` or stay; keep the axis `stroke`).
- `YAxis`: add `tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}` (keep `width={40}` + `stroke`).
- `<Tooltip>`: make it theme-aware and legible in both modes:
  `contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}`,
  `labelStyle={{ color: 'var(--foreground)' }}`, `itemStyle={{ color: 'var(--foreground)' }}`.

### Testing
- Update the export test: the button query changes from `/exportar pdf/i` to `/exportar evolução/i` (assert it still calls `downloadAssessmentsPdf('p1')`).
- The recharts prop changes are visual; existing chart tests stay green (recharts is typically shallow-rendered/smoke-tested here — no query asserts tick fill).

---

## T4 — PDF chart value labels (#5) + keep-together (#6)

**File:** `apps/api/src/patients/pdf/evolution-doc.ts` (+ `evolution-doc.spec.ts`)

### #5 value labels via SVG
Replace the canvas-based `drawChart` (pdfmake `canvas` cannot render text, so value labels are impossible there) with an **SVG** node. `drawChart(series)` returns `{ svg: <string>, width: CHART_W, ... }` where the SVG (viewBox `0 0 CHART_W CHART_H`) draws:
- three horizontal gridlines (`<line stroke='#dddddd'>`),
- the teal trend polyline (`<polyline fill='none' stroke='#14bfa6' stroke-width='1.5'>`),
- a dot per point (`<circle r='2' fill='#14bfa6'>`),
- **a value label per point** (`<text>` with the pt-BR-formatted value), positioned above the point, flipping below when the point is within a small margin of the top edge, and edge-anchored (start/middle/end) at the first/last points — porting the mobile `apps/mobile/components/chart/line-chart.tsx` label-placement logic (`labelOf`, `LABEL_GAP`/`LABEL_DROP`/`LABEL_TOP_MIN`).

Reuse the existing scaling (`px`/`py`, flat-series padding). Keep the `series.length < 2 → { text: 'dados insuficientes' }` branch unchanged. The `Record<string, unknown>[]`/`as unknown as Content` canvas casts are removed; `{ svg }` is a typed content member so a plain `Content` return works.

### #6 keep heading with table
In `buildEvolutionDocDefinition`, wrap each history section's heading + table together and mark it unbreakable, e.g.:
```
content.push({ stack: [ { text: 'Histórico — composição', style: 'section', margin: [...] }, compositionTable(...) ], unbreakable: true });
```
Same for `Histórico — circunferências`. (The `Tendências` charts may still break across pages — only the two tables need the atomic heading+table.)

### Testing
`evolution-doc.spec.ts` updates:
- The chart assertion changes from "a `polyline` canvas node exists" to "a metric with ≥2 points yields an **`svg`** node whose string contains the point's value" (e.g. contains `80` and `78` for the sample series) and still `<2 points → 'dados insuficientes'`.
- Add an assertion that the two history sections are `unbreakable` stacks (find the `stack` nodes with `unbreakable === true`, each containing a table).
- Keep the branding/logo assertions (header image node only when a logo data URL is given).

---

## File map

- `apps/web/src/components/patients/patient-detail.tsx` — #1 spinner/label + #2 header size (+ test)
- `apps/web/src/components/patients/patients-list.tsx` — #2 list sizes
- `apps/web/src/components/patients/meal-plan-editor.tsx` — #3 max-w-4xl
- `apps/web/src/components/patients/bioimpedance-section.tsx` — #4 label + #7 chart (+ test)
- `apps/api/src/patients/pdf/evolution-doc.ts` + `evolution-doc.spec.ts` — #5 svg chart + value labels, #6 unbreakable
