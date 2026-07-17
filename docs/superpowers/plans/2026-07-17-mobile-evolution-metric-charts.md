# Mobile Evolution Metric-Selector Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the patient app's 3 fixed evolution trend charts with a single chart + a metric-selector chip row covering all body-composition measurements (including the recently-added ones).

**Architecture:** One-file change in `apps/mobile/app/(app)/index.tsx`: a `CHART_METRICS` list drives a `flex-wrap` chip selector; a `selectedMetric` state picks which series a single reused `<Trend>`/`<LineChart>` plots. The PDF export, snapshot tiles, and Detalhes grid are untouched.

**Tech Stack:** Expo / React Native, NativeWind, `react-native-svg` (via the existing `LineChart`), Jest + `@testing-library/react-native`.

## Global Constraints

- Branch `feat/mobile-evolution-charts` (off main; spec committed 96a4f97). NO new dependencies.
- pt-BR copy. Match the file's quote style — **mobile uses single quotes**. Mobile tests = **Jest** (never import vitest).
- The **"Exportar PDF" export is OUT OF SCOPE** — do not modify `onExport`/`downloadEvolutionPdf` or its button.
- Snapshot **tiles** and the **"Detalhes" grid** stay unchanged. Only the "Tendências" section changes.
- Verify `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (exit 0) and `pnpm --filter @nutri-plus/mobile test`.
- Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push/PR.

---

### Task 1: Metric-selector trend charts

**Files:**
- Modify: `apps/mobile/app/(app)/index.tsx`
- Test: `apps/mobile/app/(app)/index.test.tsx`

**Interfaces:**
- Consumes: `useMyEvolution()` → `{ name, height, assessments, canLog }`; `LineChart({ data: {x:number;y:number}[] })` (renders a `line-chart-path` testID node when `data.length >= 2`); the existing `bmi(weight, height)` and `Trend({ label, points })` helpers in the same file.
- Produces: no cross-task interface (final task).

- [ ] **Step 1: Update the test file — encode the target behavior**

In `apps/mobile/app/(app)/index.test.tsx`:

(a) The existing test `'renders the greeting, latest snapshot and trend charts from data'` has assertions that break once chips share the tile labels and the 3 charts collapse to 1. Replace its body's chart/label assertions:

```tsx
  it('renders the greeting, latest snapshot and trend charts from data', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: two });
    await render(<Home />);
    expect(screen.getByText('Olá, Ana')).toBeTruthy();
    // 'Peso'/'IMC' now appear both as a snapshot tile AND a selector chip → use getAllByText
    expect(screen.getAllByText('Peso').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('IMC').length).toBeGreaterThanOrEqual(1);
    // latest weight 78 kg is shown (regex: the tile composes '78,0' + ' kg' in one Text)
    expect(screen.getByText(/78,0/)).toBeTruthy();
    // single selectable chart, defaulting to Peso (2 points → one path)
    expect(screen.getAllByTestId('line-chart-path').length).toBe(1);
  });
```

(b) Add two new tests (place them after the test above):

```tsx
  it('offers the newly-added measurements in the metric selector', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: two });
    await render(<Home />);
    // These labels appear only as chips (the Detalhes grid uses '(cm)'/'(%)' suffixes), so they are unique.
    expect(screen.getByText('Massa magra')).toBeTruthy();
    expect(screen.getByText('Abdômen')).toBeTruthy();
    expect(screen.getByText('Braço contraído')).toBeTruthy();
    expect(screen.getByText('Panturrilha')).toBeTruthy();
  });

  it('switches the charted metric when a chip is pressed', async () => {
    mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: two });
    await render(<Home />);
    // Default Peso has 2 points → one chart path.
    expect(screen.getAllByTestId('line-chart-path').length).toBe(1);
    // Abdômen is null in both fixture rows → insufficient data: message, no chart.
    await fireEvent.press(screen.getByText('Abdômen'));
    expect(screen.getByText('Sem histórico suficiente para tendência ainda.')).toBeTruthy();
    expect(screen.queryAllByTestId('line-chart-path').length).toBe(0);
  });
```

- [ ] **Step 2: Run the tests — expect FAIL**

Run: `pnpm --filter @nutri-plus/mobile test -- index.test`
Expected: FAIL — the new chip labels ('Massa magra', 'Abdômen', …) aren't rendered yet, and the default test expects 1 chart path while the current code still renders 3.

- [ ] **Step 3: Add `Pressable` to the react-native import**

In `apps/mobile/app/(app)/index.tsx`, line 2, add `Pressable`:
```tsx
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
```

- [ ] **Step 4: Add the `CHART_METRICS` list, `ChartMetric` type, and `seriesFor` helper**

Immediately after the existing `METRICS` array (which stays as-is, driving the tiles), add:

```tsx
// The full set of measurements available as a selectable trend chart, including
// a computed IMC series. Labels are chip-sized (the Detalhes grid keeps its own
// '(cm)'/'(%)' labels).
const CHART_METRICS = [
  { key: 'weight', label: 'Peso' },
  { key: 'imc', label: 'IMC' },
  { key: 'bodyFatPercentage', label: '% Gordura' },
  { key: 'muscleMassPercentage', label: 'Massa muscular' },
  { key: 'leanMassPercentage', label: 'Massa magra' },
  { key: 'visceralFat', label: 'Gordura visceral' },
  { key: 'basalMetabolicRate', label: 'TMB' },
  { key: 'bodyWaterPercentage', label: '% Água' },
  { key: 'boneMass', label: 'Massa óssea' },
  { key: 'metabolicAge', label: 'Idade metabólica' },
  { key: 'waistCircumference', label: 'Cintura' },
  { key: 'abdomenCircumference', label: 'Abdômen' },
  { key: 'hipCircumference', label: 'Quadril' },
  { key: 'thighCircumference', label: 'Coxa medial' },
  { key: 'armCircumference', label: 'Braço relaxado' },
  { key: 'contractedArmCircumference', label: 'Braço contraído' },
  { key: 'chestCircumference', label: 'Busto' },
  { key: 'calfCircumference', label: 'Panturrilha' },
] as const;

type ChartMetric = (typeof CHART_METRICS)[number]['key'];

// Builds a chronological {x,y} series for the selected metric. 'imc' is computed
// per assessment from weight + height; every other key reads the field directly.
// Null/undefined values are dropped and x is re-indexed over the remaining points.
function seriesFor(
  metric: ChartMetric,
  assessments: BodyAssessment[],
  height: number | null,
): { x: number; y: number }[] {
  const valueOf = (a: BodyAssessment): number | null =>
    metric === 'imc' ? bmi(a.weight, height) : (a[metric] as number | null);
  return assessments
    .map(valueOf)
    .filter((y): y is number => y !== null && y !== undefined)
    .map((y, i) => ({ x: i, y }));
}
```

- [ ] **Step 5: Add the `selectedMetric` state and the chart points**

In `Home()`, alongside the existing `useState` calls (near `downloading`/`pdfError`), add:
```tsx
  const [selectedMetric, setSelectedMetric] = useState<ChartMetric>('weight');
```

Then, after `const trend = ...` is removed (Step 6) — i.e. in the render-prep area after `const { name, height, assessments, canLog } = query.data!;` and the `latest`/`previous` lines — compute:
```tsx
  const chartPoints = seriesFor(selectedMetric, assessments, height);
  const chartLabel = CHART_METRICS.find((m) => m.key === selectedMetric)!.label;
```

- [ ] **Step 6: Remove the old `trend()` helper and replace the "Tendências" section**

Delete the `trend` helper:
```tsx
  const trend = (key: Metric) =>
    assessments
      .filter((a) => a[key] !== null)
      .map((a, i) => ({ x: i, y: a[key] as number }));
```

Replace the entire "Tendências" `<View>` (the block that maps `METRICS` to `<Trend>`):
```tsx
        <View className="gap-3">
          <Text className="font-heading text-lg text-foreground">Tendências</Text>
          {METRICS.map((m) => (
            <Trend key={m.key} label={m.trendLabel} points={trend(m.key)} />
          ))}
        </View>
```
with the chip selector + single reused `<Trend>`:
```tsx
        <View className="gap-3">
          <Text className="font-heading text-lg text-foreground">Tendências</Text>
          <View className="flex-row flex-wrap gap-2">
            {CHART_METRICS.map((m) => {
              const selected = m.key === selectedMetric;
              return (
                <Pressable
                  key={m.key}
                  accessibilityRole="button"
                  onPress={() => setSelectedMetric(m.key)}
                  className={`rounded-full border px-3 py-1 ${
                    selected ? 'border-primary bg-primary' : 'border-border bg-card'
                  }`}
                >
                  <Text
                    className={`font-sans text-xs ${
                      selected ? 'text-primary-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Trend label={chartLabel} points={chartPoints} />
        </View>
```
(The `Trend` component already renders the `LineChart` when `points.length >= 2`, else the "Sem histórico suficiente para tendência ainda." message — reused unchanged.)

- [ ] **Step 7: Run the tests — expect PASS**

Run: `pnpm --filter @nutri-plus/mobile test -- index.test`
Expected: PASS (all Evolução screen tests, including the two new ones).

- [ ] **Step 8: Typecheck + full mobile suite**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit`
Expected: exit 0 (no output). Note: `Metric` (used by the tiles' `METRICS`) is still referenced; `ChartMetric` is the new selector type — both must typecheck. If `tsc` flags `Metric` as unused after the `trend()` removal, confirm `METRICS`/`Tile`/`deltaOf` still reference it (they do via `METRICS: { key: Metric; … }`), so no change is needed.

Run: `pnpm --filter @nutri-plus/mobile test`
Expected: full mobile suite green.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/app/\(app\)/index.tsx apps/mobile/app/\(app\)/index.test.tsx
git commit -m "feat(mobile): metric-selector trend charts on the evolution screen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

```bash
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
pnpm --filter @nutri-plus/mobile test
```

Manual (patient app): open the evolution screen → a chip row appears above one chart; "Peso" is selected and charted by default; tapping "Massa magra" / "Abdômen" / "Cintura" / etc. re-plots that measurement (or shows "Sem histórico suficiente…" when it has fewer than two recorded values); the snapshot tiles, Detalhes grid, and "Exportar PDF" button are unchanged.
