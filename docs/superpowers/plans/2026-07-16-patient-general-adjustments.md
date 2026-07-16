# Patient General Adjustments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six small nutritionist-web + evolution-PDF adjustments: clearer remove-photo label, computed IMC (listing + detail), percentage→kg helper labels, larger PDF fonts, always-visible export button, and Agenda menu reorder.

**Architecture:** IMC is computed server-side (one formula) and exposed on `PatientSummary`; everything else is UI/copy/config. No DB migration.

**Tech Stack:** NestJS + Prisma (apps/api), Next.js + react-query + react-hook-form (apps/web), pdfmake (evolution PDF), `@nutri-plus/shared-types`.

## Global Constraints

- Branch `feat/patient-general-adjustments` (off main; spec committed 0a1c092). NO new dependencies. pt-BR copy.
- NO DB migration (IMC is computed, not stored). shared-types rebuilt after edits.
- Match each file's quote style (web is mixed — **`assessment-dialog.tsx` uses single quotes for JSX attrs**; match the file you edit). API + mobile tests = **Jest**; web = **vitest**.
- IMC display = number **+ WHO classification**: `< 18.5` Abaixo do peso · `18.5–24.9` Peso normal · `25–29.9` Sobrepeso · `≥ 30` Obesidade.
- PDF stays **A4 portrait**; moderate font increase (the 11-column composition table grows less to avoid overflow).
- Percentage→kg applies to all 4 percentage measures, marked experimental (may change/be removed).
- Adding required `imc` to `PatientSummary` breaks strict-literal `PatientSummary`/`PatientDetail` fixtures in web AND mobile — update them.
- Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push/PR.

---

### Task 1: API + shared-types — computed IMC

**Files:**
- Create: `apps/api/src/patients/imc.ts`
- Create: `apps/api/src/patients/imc.spec.ts`
- Modify: `packages/shared-types/src/v1/patient.ts` (add `imc` to `PatientSummary`)
- Modify: `apps/api/src/patients/patients.service.ts` (`listPatients`, `getPatient`, `updatePatient`)

**Interfaces produced:**
- `computeImc(height: number | null, weightKg: number | null): number | null`
- `PatientSummary.imc: number | null` (inherited by `PatientDetail`)

- [ ] **Step 1: shared-types — add `imc`**

In `packages/shared-types/src/v1/patient.ts`, add to `PatientSummary` (after `height`):
```ts
  imc: number | null;
```
Build: `pnpm --filter @nutri-plus/shared-types build` (exit 0).

- [ ] **Step 2: Write the failing IMC unit test**

Create `apps/api/src/patients/imc.spec.ts`:
```ts
import { computeImc } from './imc';

describe('computeImc', () => {
  it('computes BMI rounded to 1 decimal', () => {
    // 70 / (1.70^2) = 24.2214... → 24.2
    expect(computeImc(170, 70)).toBe(24.2);
  });

  it('returns null when height is missing or non-positive', () => {
    expect(computeImc(null, 70)).toBeNull();
    expect(computeImc(0, 70)).toBeNull();
  });

  it('returns null when weight is missing or non-positive', () => {
    expect(computeImc(170, null)).toBeNull();
    expect(computeImc(170, 0)).toBeNull();
  });
});
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `pnpm --filter @nutri-plus/api test -- imc`
Expected: FAIL (`Cannot find module './imc'`).

- [ ] **Step 4: Implement the helper**

Create `apps/api/src/patients/imc.ts`:
```ts
// Body Mass Index = weight(kg) / height(m)^2, rounded to 1 decimal.
// Returns null unless both inputs are present and strictly positive.
export function computeImc(height: number | null, weightKg: number | null): number | null {
  if (height == null || height <= 0 || weightKg == null || weightKg <= 0) {
    return null;
  }
  const meters = height / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}
```

- [ ] **Step 5: Run it — expect PASS**

Run: `pnpm --filter @nutri-plus/api test -- imc`
Expected: PASS (3 tests).

- [ ] **Step 6: Wire IMC into the service**

In `apps/api/src/patients/patients.service.ts`:

Add the import near the top (with the other local imports):
```ts
import { computeImc } from './imc';
```

`listPatients` — change the list `findMany` to include the latest assessment, then map each item to attach `imc` and drop `assessments` (PatientSummary has no `assessments`). Replace the `$transaction` block:
```ts
    const [rawItems, total] = await this.prisma.$transaction([
      this.prisma.patientProfile.findMany({
        where,
        include: PATIENT_DETAIL_INCLUDE,
        orderBy: { user: { name: 'asc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.patientProfile.count({ where }),
    ]);

    const items = rawItems.map(({ assessments, ...rest }) => ({
      ...rest,
      imc: computeImc(rest.height, assessments[0]?.weight ?? null),
    }));

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
```

`getPatient` — after the not-found check, return with `imc`:
```ts
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return { ...patient, imc: computeImc(patient.height, patient.assessments[0]?.weight ?? null) };
```

`updatePatient` — wrap the `update` result the same way:
```ts
    const patient = await this.prisma.patientProfile.update({
      where: { id },
      data: dto,
      include: PATIENT_DETAIL_INCLUDE,
    });
    return { ...patient, imc: computeImc(patient.height, patient.assessments[0]?.weight ?? null) };
```
(Both `getPatient` and `updatePatient` keep `assessments` in the response — only the list drops it.)

- [ ] **Step 7: Verify API + shared-types**

Run: `pnpm --filter @nutri-plus/api test -- imc` (PASS), then `pnpm --filter @nutri-plus/api exec tsc --noEmit` (exit 0), then `pnpm --filter @nutri-plus/shared-types build` (exit 0).
(Repo-wide ESLint is broken — a known pre-existing issue; use `tsc` to typecheck.)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/patients/imc.ts apps/api/src/patients/imc.spec.ts apps/api/src/patients/patients.service.ts packages/shared-types/src/v1/patient.ts
git commit -m "feat(api): computed IMC on patient summary/detail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Web — IMC display (listing + detail) + clearer remove-photo label

**Files:**
- Create: `apps/web/src/lib/health/imc.ts`
- Create: `apps/web/src/lib/health/imc.test.ts`
- Modify: `apps/web/src/components/patients/patients-list.tsx` (new IMC column)
- Modify: `apps/web/src/components/patients/patient-detail.tsx` (IMC card + "Remover foto" label)
- Modify: web test fixtures that build `PatientSummary`/`PatientDetail` literals (add `imc`)

**Interfaces:**
- Consumes: `PatientSummary.imc: number | null` (Task 1).
- Produces: `imcCategory(imc: number | null): string | null`, `formatImc(imc: number | null): string`.

- [ ] **Step 1: Write the failing util test**

Create `apps/web/src/lib/health/imc.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { imcCategory, formatImc } from './imc';

describe('imcCategory', () => {
  it('classifies by WHO bands', () => {
    expect(imcCategory(17)).toBe('Abaixo do peso');
    expect(imcCategory(22)).toBe('Peso normal');
    expect(imcCategory(27)).toBe('Sobrepeso');
    expect(imcCategory(31)).toBe('Obesidade');
  });
  it('uses inclusive lower bounds', () => {
    expect(imcCategory(18.5)).toBe('Peso normal');
    expect(imcCategory(25)).toBe('Sobrepeso');
    expect(imcCategory(30)).toBe('Obesidade');
  });
  it('returns null for null input', () => {
    expect(imcCategory(null)).toBeNull();
  });
});

describe('formatImc', () => {
  it('formats value + category with pt-BR decimal', () => {
    expect(formatImc(24.2)).toBe('24,2 · Peso normal');
  });
  it('returns an em dash for null', () => {
    expect(formatImc(null)).toBe('—');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @nutri-plus/web test -- imc`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the util**

Create `apps/web/src/lib/health/imc.ts`:
```ts
// WHO BMI categories (pt-BR). Lower bounds are inclusive.
export function imcCategory(imc: number | null): string | null {
  if (imc == null) return null;
  if (imc < 18.5) return 'Abaixo do peso';
  if (imc < 25) return 'Peso normal';
  if (imc < 30) return 'Sobrepeso';
  return 'Obesidade';
}

// "24,2 · Peso normal", or "—" when unavailable.
export function formatImc(imc: number | null): string {
  if (imc == null) return '—';
  return `${imc.toLocaleString('pt-BR')} · ${imcCategory(imc)}`;
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm --filter @nutri-plus/web test -- imc`
Expected: PASS.

- [ ] **Step 5: Add the IMC column to the listing**

In `apps/web/src/components/patients/patients-list.tsx`:

Add the import (top, with the other `@/lib` imports):
```ts
import { formatImc } from '@/lib/health/imc';
```

In the desktop table `<thead>` row, add an IMC header after "Atividade":
```tsx
                  <th className="px-4 py-3 font-semibold">Atividade</th>
                  <th className="px-4 py-3 font-semibold">IMC</th>
                  <th className="px-4 py-3 font-semibold">Desde</th>
```

In the table body row, add the IMC cell in the same position (after the Atividade cell):
```tsx
                    <td className="px-4 py-3">{p.activityLevel ? ACTIVITY_LABELS[p.activityLevel] : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatImc(p.imc)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(p.createdAt)}</td>
```

- [ ] **Step 6: Add the IMC card + fix the remove-photo label in patient-detail**

In `apps/web/src/components/patients/patient-detail.tsx`:

Add the import (with the other `@/lib` imports):
```ts
import { formatImc } from '@/lib/health/imc';
```

Change the remove-photo button (currently label `Remover`) to be explicit — replace:
```tsx
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
```
with:
```tsx
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full text-destructive"
                  onClick={onRemovePhoto}
                  disabled={photoPending}
                  aria-label="Remover foto do paciente"
                >
                  Remover foto
                </Button>
```

Add an IMC card immediately after the header card's closing `</div>` (the `<div className="flex items-center gap-3 rounded-xl border bg-card p-4">…</div>` block that ends at line ~130, before `<Tabs …>`):
```tsx
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground">IMC</p>
        <p className="text-lg font-bold">{formatImc(patient.imc)}</p>
      </div>
```

- [ ] **Step 7: Update fixtures + tests**

Find every web test that builds a `PatientSummary`/`PatientDetail` literal (search: `grep -rl "canLogAssessments" apps/web/src` and any `usePatient`/`usePatients` mocks — e.g. `patient-detail.test.tsx`, `patients-list.test.tsx` if present, `edit-patient-form.test.tsx`, `create-patient-form.test.tsx`). Add `imc: <number|null>` to each literal (use `null` by default, or a value where asserting).

Add/extend a listing test asserting the IMC column renders `formatImc` output for a patient with `imc: 24.2` (`24,2 · Peso normal`) and `—` for `imc: null`. Add/extend a `patient-detail.test.tsx` case asserting the IMC card shows the formatted value and the button reads "Remover foto".

- [ ] **Step 8: Verify + commit**

Run: `pnpm --filter @nutri-plus/web test -- imc patients-list patient-detail` (PASS) and `pnpm --filter @nutri-plus/web exec tsc --noEmit` (exit 0).
```bash
git add apps/web/src/lib/health/imc.ts apps/web/src/lib/health/imc.test.ts apps/web/src/components/patients/patients-list.tsx apps/web/src/components/patients/patient-detail.tsx apps/web/src/components/patients/patient-detail.test.tsx
# plus any fixture files touched
git commit -m "feat(web): IMC column + card, clearer remove-photo label

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Web — percentage → real kg labels (experimental)

**Files:**
- Modify: `apps/web/src/lib/health/imc.ts` (add `kgFromPercent`)
- Modify: `apps/web/src/lib/health/imc.test.ts`
- Modify: `apps/web/src/components/patients/bioimpedance-section.tsx` (summary cards + history % columns)
- Modify: `apps/web/src/components/patients/assessment-dialog.tsx` (gray hint on 4 % inputs)

**Interfaces:**
- Produces: `kgFromPercent(weightKg: number | null, pct: number | null): number | null`.

- [ ] **Step 1: Write the failing test for `kgFromPercent`**

Add to `apps/web/src/lib/health/imc.test.ts`:
```ts
import { kgFromPercent } from './imc';

describe('kgFromPercent', () => {
  it('computes weight * pct / 100 rounded to 1 decimal', () => {
    expect(kgFromPercent(91, 10)).toBe(9.1);
  });
  it('returns null when weight or percent is missing', () => {
    expect(kgFromPercent(null, 10)).toBeNull();
    expect(kgFromPercent(91, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter @nutri-plus/web test -- imc`
Expected: FAIL (`kgFromPercent` not exported).

- [ ] **Step 3: Implement `kgFromPercent`**

Add to `apps/web/src/lib/health/imc.ts`:
```ts
// EXPERIMENTAL (see spec §3): the real value in kg represented by a percentage
// of body weight. May change or be removed.
export function kgFromPercent(weightKg: number | null, pct: number | null): number | null {
  if (weightKg == null || pct == null) return null;
  return Math.round((weightKg * pct) / 100 * 10) / 10;
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm --filter @nutri-plus/web test -- imc`
Expected: PASS.

- [ ] **Step 5: Summary cards + history kg labels (bioimpedance-section)**

In `apps/web/src/components/patients/bioimpedance-section.tsx`, add the import:
```ts
import { kgFromPercent } from '@/lib/health/imc';
```

Add a small formatter near the existing `fmt` helper:
```ts
// EXPERIMENTAL: gray "≈ X kg" derived from a percentage + weight (spec §3).
function fmtKg(weight: number | null, pct: number | null): string | null {
  const kg = kgFromPercent(weight, pct);
  return kg == null ? null : `≈ ${kg.toLocaleString('pt-BR')} kg`;
}
```

Summary cards — the `SUMMARY` map currently renders one value + label per card. For the two percentage cards (`bodyFatPercentage`, `leanMassPercentage`), render the kg sub-line under the label. Replace the card body:
```tsx
            {SUMMARY.map((m) => {
              const kg =
                m.key === 'bodyFatPercentage' || m.key === 'leanMassPercentage'
                  ? fmtKg(latest.weight, latest[m.key])
                  : null;
              return (
                <div key={m.key} className="rounded-xl border bg-card p-3 text-center">
                  <p className="text-lg font-bold">{fmt(latest[m.key])}</p>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  {kg && <p className="text-xs text-muted-foreground/70">{kg}</p>}
                </div>
              );
            })}
```

History table % columns — under each of `% Gord.`, `% Músc.`, `% Magra` show the kg for that row (using the row's `weight`). Replace those three cells:
```tsx
                    <td className="px-4 py-3">
                      {fmt(a.bodyFatPercentage)}
                      {fmtKg(a.weight, a.bodyFatPercentage) && (
                        <span className="block text-xs text-muted-foreground/70">
                          {fmtKg(a.weight, a.bodyFatPercentage)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {fmt(a.muscleMassPercentage)}
                      {fmtKg(a.weight, a.muscleMassPercentage) && (
                        <span className="block text-xs text-muted-foreground/70">
                          {fmtKg(a.weight, a.muscleMassPercentage)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {fmt(a.leanMassPercentage)}
                      {fmtKg(a.weight, a.leanMassPercentage) && (
                        <span className="block text-xs text-muted-foreground/70">
                          {fmtKg(a.weight, a.leanMassPercentage)}
                        </span>
                      )}
                    </td>
```

- [ ] **Step 6: Gray kg hint on the 4 percentage inputs (assessment-dialog)**

In `apps/web/src/components/patients/assessment-dialog.tsx` (this file uses **single quotes** — match it), add the import:
```ts
import { kgFromPercent } from '@/lib/health/imc';
```

Add a set of the percentage field names near the top-level consts:
```ts
const PERCENT_FIELDS = new Set(['bodyFatPercentage', 'muscleMassPercentage', 'leanMassPercentage', 'bodyWaterPercentage']);
```

Modify `renderNumber` so percentage fields show a live gray hint from the watched weight. Replace the function body's `render` with:
```tsx
        render={({ field }) => {
          const weightRaw = form.watch('weight');
          const w = weightRaw === '' || weightRaw == null ? null : Number(weightRaw);
          const p = field.value === '' || field.value == null ? null : Number(field.value);
          const kg =
            PERCENT_FIELDS.has(name as string) && w != null && !Number.isNaN(w) && p != null && !Number.isNaN(p)
              ? kgFromPercent(w, p)
              : null;
          return (
            <FormItem>
              <FormLabel>{label}</FormLabel>
              <FormControl>
                <Input type='number' inputMode='decimal' step='any' {...field} />
              </FormControl>
              {/* EXPERIMENTAL (spec §3): real value in kg for this percentage. */}
              {kg != null && (
                <p className='mt-1 text-right text-xs text-muted-foreground/70'>
                  ≈ {kg.toLocaleString('pt-BR')} kg
                </p>
              )}
              <FormMessage />
            </FormItem>
          );
        }}
```

- [ ] **Step 7: Tests**

- `bioimpedance-section.test.tsx`: add a case with a fixture (`weight: 91`, `bodyFatPercentage: 10`) asserting `≈ 9,1 kg` appears in the summary card and history.
- `assessment-dialog.test.tsx`: render for a new assessment, type `91` into "Peso (kg)" and `10` into "% Gordura", assert `≈ 9,1 kg` appears; and that with weight empty no hint shows.

- [ ] **Step 8: Verify + commit**

Run: `pnpm --filter @nutri-plus/web test -- imc bioimpedance-section assessment-dialog` (PASS) and `pnpm --filter @nutri-plus/web exec tsc --noEmit` (exit 0).
```bash
git add apps/web/src/lib/health/imc.ts apps/web/src/lib/health/imc.test.ts apps/web/src/components/patients/bioimpedance-section.tsx apps/web/src/components/patients/bioimpedance-section.test.tsx apps/web/src/components/patients/assessment-dialog.tsx apps/web/src/components/patients/assessment-dialog.test.tsx
git commit -m "feat(web): experimental kg labels for percentage measures

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Evolution PDF — larger, more readable fonts (portrait)

**Files:**
- Modify: `apps/api/src/patients/pdf/evolution-doc.ts`
- Modify: `apps/api/src/patients/pdf/evolution-doc.spec.ts` (if it pins font sizes)

- [ ] **Step 1: Check the spec's font-size assertions**

Run: `grep -n "fontSize\|defaultStyle\|title\|section" apps/api/src/patients/pdf/evolution-doc.spec.ts`
Note any assertion that pins a font size (those must be updated in Step 3 to the new values).

- [ ] **Step 2: Raise the document + table font sizes**

In `apps/api/src/patients/pdf/evolution-doc.ts`:

`docShell` — bump `defaultStyle` and `styles`:
```ts
    defaultStyle: { font: 'Roboto', fontSize: 11 },
    pageMargins: [40, 40, 40, 40],
    styles: {
      brand: { fontSize: 16, bold: true },
      title: { fontSize: 18, bold: true },
      section: { fontSize: 14, bold: true },
      chartLabel: { fontSize: 11, bold: true, color: '#444444' },
      muted: { fontSize: 10, color: '#666666' },
      th: { bold: true, fontSize: 10, color: '#666666' },
    },
```

`compositionTable` (11 columns, `Array(11).fill('auto')` — the widest, overflow risk) — bump conservatively to 9:
```ts
    table: { headerRows: 1, widths: Array(11).fill('auto'), body },
    layout: 'lightHorizontalLines',
    fontSize: 9,
    margin: [0, 0, 0, 6],
```

`circumferenceTable` (9 columns, `Array(9).fill('*')` — distributes to page width) — bump to 10:
```ts
    table: { headerRows: 1, widths: Array(9).fill('*'), body },
    layout: 'lightHorizontalLines',
    fontSize: 10,
    margin: [0, 0, 0, 6],
```
(Note: the `th` style is shared by both tables' headers; at `fontSize: 10` the composition header row is slightly larger than its 9pt body — acceptable. If a reviewer prefers, the composition `th` can stay smaller, but keep it simple: leave `th` at 10.)

- [ ] **Step 3: Update the spec assertions**

Update any `evolution-doc.spec.ts` assertion that pinned an old font size to the new value from Step 2. If the spec only asserts structure/content (not font sizes), no change is needed — re-run it to confirm.

- [ ] **Step 4: Verify + commit**

Run: `pnpm --filter @nutri-plus/api test -- evolution-doc` (PASS) and `pnpm --filter @nutri-plus/api exec tsc --noEmit` (exit 0).
Manual sanity (documented, not automated): the composition table has 11 columns — confirm the bump to 9pt does not push it past the A4 portrait content width (≈ 515pt with 40pt margins). If it visibly overflows, drop the composition table to `fontSize: 8` (unchanged) and keep only the circumference table + text larger; note the decision in the commit body.
```bash
git add apps/api/src/patients/pdf/evolution-doc.ts apps/api/src/patients/pdf/evolution-doc.spec.ts
git commit -m "feat(api): larger fonts in the evolution PDF for readability

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Export button on every tab + Agenda menu reorder

**Files:**
- Modify: `apps/web/src/components/patients/patient-detail.tsx` (add export button to header)
- Modify: `apps/web/src/components/patients/bioimpedance-section.tsx` (remove export button)
- Modify: `apps/web/src/components/app/nav-items.ts` (Agenda → 2nd)
- Modify: tests as needed

- [ ] **Step 1: Move the export logic into patient-detail**

In `apps/web/src/components/patients/patient-detail.tsx`:

Add imports:
```ts
import { useState } from 'react';
import { useAssessments } from '@/lib/queries/assessments';
import { downloadAssessmentsPdf } from '@/lib/api/assessments';
```
(Merge `useState` into the existing `react` import that already imports `useRef`.)

Inside the component, after the existing photo hooks, add the export state + handler (react-query shares the `useAssessments` cache with the bioimpedance tab, so this adds no duplicate request):
```ts
  const assessments = useAssessments(id);
  const [exporting, setExporting] = useState(false);

  async function onExport() {
    setExporting(true);
    try {
      await downloadAssessmentsPdf(id);
    } catch {
      toast.error('Não foi possível exportar o PDF.');
    } finally {
      setExporting(false);
    }
  }
```

Render an "Exportar evolução" button in the header card. In the header block, the `<span className="ml-auto self-start …">Paciente</span>` badge sits top-right; wrap the badge + button in a column so the button is always visible regardless of tab. Replace that `<span … >Paciente</span>` with:
```tsx
        <div className="ml-auto flex flex-col items-end gap-2">
          <span className="self-end rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
            Paciente
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={onExport}
            disabled={exporting || (assessments.data?.length ?? 0) === 0}
          >
            {exporting ? 'Exportando…' : 'Exportar evolução'}
          </Button>
        </div>
```

- [ ] **Step 2: Remove the export button from bioimpedance-section**

In `apps/web/src/components/patients/bioimpedance-section.tsx`:

Remove the export button JSX (the `<Button …>{exporting ? 'Exportando…' : 'Exportar evolução'}</Button>` block) from the header `div`, leaving just the "Nova avaliação" button. The header becomes:
```tsx
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-bold">Bioimpedância</h2>
        <div className="flex gap-2">
          {canEdit && (
            <Button size="sm" className="rounded-full" onClick={() => setCreating(true)}>
              Nova avaliação
            </Button>
          )}
        </div>
      </div>
```
Then remove the now-unused `exporting` state, the `onExport` function, the `downloadAssessmentsPdf` import, and the `toast` import **only if** `toast` is no longer used elsewhere in the file (it is not — verify and remove). Run `tsc` to catch any unused-symbol/type error.

- [ ] **Step 3: Reorder the sidebar menu**

In `apps/web/src/components/app/nav-items.ts`, move the `Agenda` entry to the second position so `NAV_ITEMS` is ordered: `Pacientes`, `Agenda`, `Funcionários`, `Contabilidade`, `Configurações` (move the whole Agenda object above the Funcionários object; leave every object's contents unchanged).

- [ ] **Step 4: Tests**

- `patient-detail.test.tsx`: assert the "Exportar evolução" button renders in the header (mock `useAssessments` to return a non-empty list so it's enabled; empty list → disabled). Ensure the existing `usePatient` mock is present; add a `useAssessments` mock.
- `bioimpedance-section.test.tsx`: update any assertion that expected the export button here (it now lives in patient-detail) — remove/adjust so the suite still passes.
- Sidebar test (`app-sidebar.test.tsx` or `nav-items`): if it asserts order, update it to expect Agenda second; otherwise add a small assertion that `NAV_ITEMS[1].label === 'Agenda'`.

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter @nutri-plus/web test` (full suite PASS) and `pnpm --filter @nutri-plus/web exec tsc --noEmit` (exit 0).
```bash
git add apps/web/src/components/patients/patient-detail.tsx apps/web/src/components/patients/bioimpedance-section.tsx apps/web/src/components/app/nav-items.ts apps/web/src/components/patients/patient-detail.test.tsx apps/web/src/components/patients/bioimpedance-section.test.tsx
# plus any sidebar test touched
git commit -m "feat(web): export button on any patient tab + Agenda 2nd in menu

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Mobile — reconcile the `imc` shared-type change

**Files:**
- Modify: any `apps/mobile` test fixture that constructs a `PatientSummary`/`PatientDetail` literal (add `imc`)

**Interfaces:** Consumes `PatientSummary.imc` (Task 1).

- [ ] **Step 1: Find affected fixtures**

Run: `grep -rln "canLogAssessments\|PatientSummary\|PatientDetail" apps/mobile`
The patient app uses `MyEvolution`, not the nutritionist patient listing, so most likely there are **no** `PatientSummary`/`PatientDetail` literals. If none are found, this task is a no-op beyond verification.

- [ ] **Step 2: Add `imc` to any found fixtures**

For each literal found, add `imc: null` (or a value). If none were found, skip.

- [ ] **Step 3: Verify**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (exit 0) and `pnpm --filter @nutri-plus/mobile test` (PASS).

- [ ] **Step 4: Commit (only if files changed)**

```bash
git add apps/mobile
git commit -m "test(mobile): add imc to patient fixtures

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
If Step 1 found nothing, skip the commit and record in the ledger that mobile needed no change (tsc + tests already green).

---

## Final verification

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile exec tsc --noEmit && pnpm --filter @nutri-plus/mobile test
```

Manual: open a patient with ≥1 assessment → IMC card + column show `valor · categoria`; the "Exportar evolução" button is visible on every tab; bioimpedance % values show `≈ X kg`; the assessment dialog shows a live `≈ X kg` under a % field when weight is filled; the sidebar lists Agenda second; the remove-photo button reads "Remover foto"; the exported PDF text/tables are larger and the composition table still fits the page.
