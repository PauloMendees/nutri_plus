# Round-2 UI Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seven UI/UX refinements on the PR #39 feature set — photo upload loading + bigger photos, wider plan editor, clearer PDF-export label, dark-theme chart legibility, and PDF charts with per-point value labels + non-splitting history tables.

**Architecture:** Four independent tasks, each a small edit to one component (plus its test). The only non-trivial change is the evolution PDF chart, which switches from a pdfmake `canvas` node (no text support) to an `{ svg }` node so value labels can be drawn.

**Tech Stack:** Next.js + recharts + Tailwind (web); NestJS + pdfmake 0.2.23 (API).

## Global Constraints

- Same branch `feat/plan-photo-ai-adjust-evolution-pdf` (extends open PR #39). Do NOT push/PR unless asked.
- NO new dependencies. pdfmake 0.2.23 (installed) bundles `svg-to-pdfkit` and its types expose `{ svg: string }` content nodes and `unbreakable?: boolean` — no new dep needed.
- pt-BR user copy. Match each edited file's quote style (web files: single-quote imports/JS strings, double-quote JSX attrs; `evolution-doc.ts`: single quotes).
- Web theme tokens are direct-hex CSS vars in `apps/web/src/app/globals.css` (`:root` light + dark override, mapped via `@theme inline`). `var(--muted-foreground)`, `var(--border)`, `var(--card)`, `var(--foreground)` are valid colors usable directly in recharts props.
- API tests use **Jest** (not Vitest): no `vitest` import; use jest globals (mirror `apps/api/src/patients/pdf/meal-plan-doc.spec.ts` / the existing `evolution-doc.spec.ts`).
- Keep suites green. Verify: web `pnpm --filter @nutri-plus/web test` + `pnpm --filter @nutri-plus/web exec tsc --noEmit`; API `pnpm --filter @nutri-plus/api test`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Photo upload loading state + bigger photos (#1, #2)

**Files:**
- Modify: `apps/web/src/components/patients/patient-detail.tsx`
- Modify: `apps/web/src/components/patients/patients-list.tsx`
- Test: `apps/web/src/components/patients/patient-detail.test.tsx`

**Interfaces:**
- Consumes: `PatientAvatar({ name, photoUrl, className })`; `photoPending` (already computed in `patient-detail.tsx` as `uploadPhoto.isPending || deletePhoto.isPending`); `Loader2` from `lucide-react`.
- Produces: nothing new.

- [ ] **Step 1: Make the upload-pending state controllable in the test + add the failing test**

In `patient-detail.test.tsx`, next to the existing `const uploadPhotoMut = vi.fn();` / `const deletePhotoMut = vi.fn();` add a mutable flag:

```tsx
let uploadPhotoPending = false;
```

Change the `useUploadPatientPhoto` line in the `vi.mock('@/lib/queries/patients', …)` factory to read it (mirrors how the factory already references `uploadPhotoMut`):

```tsx
  useUploadPatientPhoto: () => ({ mutateAsync: uploadPhotoMut, isPending: uploadPhotoPending }),
```

In the `beforeEach` (the block with `mutateAsync.mockReset();`), reset it:

```tsx
    uploadPhotoPending = false;
```

Add the test (inside the same `describe`):

```tsx
  it('shows a saving state on the photo control while an upload is pending', () => {
    usePatient.mockReturnValue({ isLoading: false, isError: false, data: patient });
    uploadPhotoPending = true;
    render(<PatientDetail id="p1" created={false} canEdit />);
    expect(screen.getByText('Enviando…')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/patient-detail.test.tsx" -t "saving state"`
Expected: FAIL — no element with text "Enviando…".

- [ ] **Step 3: Implement the loading state + bigger detail avatar**

In `patient-detail.tsx`: add `Loader2` to the lucide import (the file already imports `ChevronLeft` from `'lucide-react'` → make it `import { ChevronLeft, Loader2 } from 'lucide-react';`).

Replace the avatar + label parts of the header block so it reads:

```tsx
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <div className="relative">
          <PatientAvatar name={patient.user.name} photoUrl={patient.photoUrl} className="size-16 text-lg" />
          {photoPending && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-bold">{patient.user.name}</p>
          <p className="truncate text-sm text-muted-foreground">{patient.user.email}</p>
          {canEdit && (
            <div className="mt-1 flex gap-2">
              <label
                aria-disabled={photoPending}
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted/40 ${photoPending ? 'pointer-events-none opacity-60' : ''}`}
              >
                {photoPending ? 'Enviando…' : patient.photoUrl ? 'Trocar foto' : 'Adicionar foto'}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label="Foto do paciente"
                  onChange={onPickPhoto}
                  disabled={photoPending}
                />
              </label>
              {patient.photoUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full text-destructive"
                  onClick={onRemovePhoto}
                  disabled={photoPending}
                >
                  Remover
                </Button>
              )}
            </div>
          )}
        </div>
        <span className="ml-auto self-start rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
          Paciente
        </span>
      </div>
```

(The only changes vs. the current code: avatar wrapped in `relative` + spinner overlay, avatar className `size-11 text-sm` → `size-16 text-lg`, and the label text/className now react to `photoPending`.)

- [ ] **Step 4: Bigger list avatars**

In `patients-list.tsx`: the mobile-card `<PatientAvatar … className="size-9 text-xs" />` → `className="size-11 text-sm"`; the desktop-table `<PatientAvatar … className="size-8 text-xs" />` → `className="size-10 text-sm"`.

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/patient-detail.test.tsx" "src/components/patients/patients-list.test.tsx"` then `cd apps/web && pnpm exec tsc --noEmit`
Expected: all pass; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/patients/patient-detail.tsx apps/web/src/components/patients/patient-detail.test.tsx apps/web/src/components/patients/patients-list.tsx
git commit -m "feat(web): photo upload loading state + larger patient avatars

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Wider meal-plan editor (#3)

**Files:**
- Modify: `apps/web/src/components/patients/meal-plan-editor.tsx`

**Interfaces:** none.

This is a class-only change (no behavior to unit-test); verification is the existing suite + tsc staying green.

- [ ] **Step 1: Widen the three wrappers**

In `meal-plan-editor.tsx`, change `max-w-3xl` → `max-w-4xl` in exactly these three places:
- the loading skeleton: `return <Skeleton className="h-64 w-full max-w-3xl" />;` → `max-w-4xl`
- the not-found wrapper: `<div className="mx-auto max-w-3xl space-y-4">` → `max-w-4xl`
- the main editor wrapper: `<div className="mx-auto max-w-3xl space-y-4">` → `max-w-4xl`

Do NOT change `patient-detail.tsx` (its `max-w-3xl` is the patient detail page, out of scope).

- [ ] **Step 2: Verify suite + tsc green**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/meal-plan-editor.test.tsx"` then `cd apps/web && pnpm exec tsc --noEmit`
Expected: all pass; tsc clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/patients/meal-plan-editor.tsx
git commit -m "feat(web): widen meal-plan editor to max-w-4xl

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Export label + dark-theme chart legibility (#4, #7)

**Files:**
- Modify: `apps/web/src/components/patients/bioimpedance-section.tsx`
- Test: `apps/web/src/components/patients/bioimpedance-section.test.tsx`

**Interfaces:** none new. (`recharts` is fully mocked in the test, so the chart prop changes don't affect tests — only the label change does.)

- [ ] **Step 1: Update the failing test (label rename)**

In `bioimpedance-section.test.tsx`, the export test clicks the button by name `/exportar pdf/i`. Change that query to the new label:

```tsx
    await user.click(screen.getByRole('button', { name: /exportar evolução/i }));
    expect(downloadAssessmentsPdf).toHaveBeenCalledWith('p1');
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/bioimpedance-section.test.tsx" -t "exports the evolution"`
Expected: FAIL — no button named /exportar evolução/i (the button still says "Exportar PDF").

- [ ] **Step 3: Rename the label**

In `bioimpedance-section.tsx`, change the export button text:

```tsx
            {exporting ? 'Exportando…' : 'Exportar evolução'}
```

- [ ] **Step 4: Theme the chart for dark mode**

In the same file, replace the `LineChart` block so the axis tick text and tooltip are theme-aware:

```tsx
                <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                  <YAxis stroke="var(--muted-foreground)" width={40} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                    labelStyle={{ color: 'var(--foreground)' }}
                    itemStyle={{ color: 'var(--foreground)' }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#14BFA6" strokeWidth={2} dot />
                </LineChart>
```

(The `fontSize={11}` moved into the `tick` object on both axes; the `stroke` and `width` are preserved.)

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/bioimpedance-section.test.tsx"` then `cd apps/web && pnpm exec tsc --noEmit`
Expected: all pass; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/patients/bioimpedance-section.tsx apps/web/src/components/patients/bioimpedance-section.test.tsx
git commit -m "feat(web): clearer evolution-export label + dark-theme chart legibility

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: PDF chart value labels (SVG) + non-splitting history tables (#5, #6)

**Files:**
- Modify: `apps/api/src/patients/pdf/evolution-doc.ts`
- Test: `apps/api/src/patients/pdf/evolution-doc.spec.ts`

**Interfaces:**
- Consumes: pdfmake `Content` (the `svg` and `unbreakable`+`stack` members).
- Produces: `drawChart(series)` now returns an `{ svg: string, width, margin }` content node (was `{ canvas, … }`).

- [ ] **Step 1: Update the failing spec (svg chart + unbreakable tables)**

In `evolution-doc.spec.ts`, replace the first test body so it asserts an `svg` chart node carrying the point values and two `unbreakable` stacks (keep the brand-name + no-logo-image assertions):

```ts
  it('draws an svg chart with per-point value labels and keeps each history heading with its table', () => {
    const doc = buildEvolutionDocDefinition({ patientName: 'Ana', height: 170, assessments: rows, branding: { displayName: 'Clínica X', logoDataUrl: null } });
    const nodes = contentArray(doc);
    // The weight chart (80 → 78) is an svg node whose value labels appear as text.
    expect(nodes.some((n) => typeof n.svg === 'string' && n.svg.includes('>80<') && n.svg.includes('>78<'))).toBe(true);
    // Both history sections are unbreakable stacks, each wrapping a table.
    const unbreakables = nodes.filter((n) => n.unbreakable === true);
    expect(unbreakables.length).toBe(2);
    expect(unbreakables.every((s) => Array.isArray(s.stack) && s.stack.some((x: any) => x.table))).toBe(true);
    // brand name present, no image when logo is null
    expect(JSON.stringify(nodes)).toContain('Clínica X');
    expect(nodes.some((n) => Array.isArray(n.columns) && n.columns.some((c: any) => c.image))).toBe(false);
  });
```

Leave the other two tests (logo-image-only-when-data-url, and "dados insuficientes") unchanged.

Also add a real render smoke test (this is what actually proves the `canvas` → `svg` switch renders through pdfmake's bundled svg-to-pdfkit — the structure assertions above would pass even if the SVG failed to render). Add the import at the top of the spec:

```ts
import { renderPdf } from '../../meal-plans/pdf/pdf-printer';
```

and the test:

```ts
  it('renders the doc (with svg charts) to a PDF buffer', async () => {
    const doc = buildEvolutionDocDefinition({ patientName: 'Ana', height: 170, assessments: rows, branding: { displayName: 'X', logoDataUrl: null } });
    const buf = await renderPdf(doc);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @nutri-plus/api test -- evolution-doc`
Expected: FAIL — no `svg` node (charts are still `canvas`), and no `unbreakable` nodes.

- [ ] **Step 3: Add label constants + rewrite `drawChart` to emit SVG**

In `evolution-doc.ts`, next to the existing chart constants (`TEAL`, `CHART_W`, `CHART_H`, `PAD_X`, `PAD_Y`), add:

```ts
// Value-label placement (ported from the mobile LineChart): sit LABEL_GAP above
// the point, flipping to LABEL_DROP below when near the top edge.
const LABEL_GAP = 8;
const LABEL_DROP = 16;
const LABEL_TOP_MIN = 10;

// pt-BR value label: integers as-is, otherwise one decimal with a comma.
function labelOf(y: number): string {
  return Number.isInteger(y) ? String(y) : y.toFixed(1).replace('.', ',');
}
```

Replace the whole `drawChart` function with the SVG version (same scaling; `<2` branch unchanged; no more casts):

```ts
// A single-metric trend chart as a pdfmake svg node, or a note when there are
// fewer than two data points. Scaling + label placement ported from the mobile
// LineChart. pdfmake canvas cannot render text, so the chart is an SVG string.
function drawChart(series: { x: number; y: number }[]): Content {
  if (series.length < 2) {
    return { text: 'dados insuficientes', style: 'muted', margin: [0, 0, 0, 8] };
  }
  const xs = series.map((p) => p.x);
  const ys = series.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const px = (x: number) =>
    xMax === xMin ? CHART_W / 2 : PAD_X + ((x - xMin) / (xMax - xMin)) * (CHART_W - 2 * PAD_X);
  const py = (y: number) =>
    CHART_H - PAD_Y - ((y - yMin) / (yMax - yMin)) * (CHART_H - 2 * PAD_Y);

  const points = series.map((p) => ({ cx: px(p.x), cy: py(p.y), label: labelOf(p.y) }));
  const last = points.length - 1;

  const gridlines = [PAD_Y, CHART_H / 2, CHART_H - PAD_Y]
    .map((gy) => `<line x1="${PAD_X}" y1="${gy}" x2="${CHART_W - PAD_X}" y2="${gy}" stroke="#dddddd" stroke-width="0.5" />`)
    .join('');
  const polyline = `<polyline fill="none" stroke="${TEAL}" stroke-width="1.5" points="${points
    .map((p) => `${p.cx},${p.cy}`)
    .join(' ')}" />`;
  const dots = points.map((p) => `<circle cx="${p.cx}" cy="${p.cy}" r="2" fill="${TEAL}" />`).join('');
  const labels = points
    .map((p, i) => {
      const anchor = i === 0 ? 'start' : i === last ? 'end' : 'middle';
      const labelY = p.cy - LABEL_GAP < LABEL_TOP_MIN ? p.cy + LABEL_DROP : p.cy - LABEL_GAP;
      return `<text x="${p.cx}" y="${labelY}" fill="#666666" font-size="9" text-anchor="${anchor}">${p.label}</text>`;
    })
    .join('');
  const svg = `<svg viewBox="0 0 ${CHART_W} ${CHART_H}" xmlns="http://www.w3.org/2000/svg">${gridlines}${polyline}${dots}${labels}</svg>`;
  return { svg, width: CHART_W, margin: [0, 0, 0, 10] };
}
```

- [ ] **Step 4: Wrap each history heading + table in an unbreakable stack**

In `buildEvolutionDocDefinition`, replace the four separate pushes for the two history sections:

```ts
  content.push({ text: 'Histórico — composição', style: 'section', margin: [0, 8, 0, 4] });
  content.push(compositionTable(assessments, height));

  content.push({ text: 'Histórico — circunferências (cm)', style: 'section', margin: [0, 10, 0, 4] });
  content.push(circumferenceTable(assessments));
```

with:

```ts
  content.push({
    stack: [
      { text: 'Histórico — composição', style: 'section', margin: [0, 8, 0, 4] },
      compositionTable(assessments, height),
    ],
    unbreakable: true,
  });

  content.push({
    stack: [
      { text: 'Histórico — circunferências (cm)', style: 'section', margin: [0, 10, 0, 4] },
      circumferenceTable(assessments),
    ],
    unbreakable: true,
  });
```

- [ ] **Step 5: Run the spec + a full-render smoke check — expect PASS**

Run: `pnpm --filter @nutri-plus/api test -- evolution-doc`
Expected: PASS — svg node with `>80<`/`>78<`, two unbreakable stacks, brand/logo assertions, "dados insuficientes", AND the render smoke test produces a `%PDF-` buffer (proves the SVG renders through svg-to-pdfkit).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/patients/pdf/evolution-doc.ts apps/api/src/patients/pdf/evolution-doc.spec.ts
git commit -m "feat(api): evolution PDF charts as SVG with per-point value labels + keep history tables together

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

```bash
pnpm --filter @nutri-plus/web test
pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/api test
```

Manual (optional, shared dev DB): open a patient in dark theme → chart axis labels legible; upload a photo → spinner + "Enviando…"; export the evolution PDF → charts show point values and no "Histórico" heading is orphaned from its table; open the plan editor → wider layout.
