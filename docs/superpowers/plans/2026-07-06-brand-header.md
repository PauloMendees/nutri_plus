# Brand Header (logomarca no topo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a thin, fixed top bar with the iNutri icon + wordmark (centered, theme-aware) to the four main tab screens.

**Architecture:** Port the web horizontal logo lockup to a `LogoHorizontal` react-native-svg component (same `tone` model as the existing `Logo`). A `BrandHeader` renders it centered with a hairline divider, choosing the tone from `useTheme().scheme`. `Screen` gains an optional fixed `header` slot; the four tab screens (and the planos single-plan `MealPlanView`) pass `header={<BrandHeader />}`.

**Tech Stack:** Expo / React Native / react-native-svg / NativeWind / the app's `lib/theme`.

## Global Constraints

- SINGLE quotes in new files; pt-BR user copy (the mark is a logo — no copy needed).
- Reuse the existing `Logo` component's `tone` pattern (`color` / `reverse` / `dark`); no new UI primitives beyond the two brand components + the `Screen` header slot.
- Expo Go must keep working — only `react-native-svg` (already a dependency); no new native modules.
- Do not reintroduce `node-linker=hoisted`; never commit `.env` or `.expo/`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do not push/PR unless asked.
- Verify per task: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` and `pnpm --filter @nutri-plus/mobile test`. Keep the suite green.
- Mobile component/hook tests render through a component (never `renderHook`); paths with parentheses are escaped in single-test `jest` runs, e.g. `"app/\(app\)/..."`.

**Scope note (deviation from spec, intentional):** the header goes on the *content* render states (data + empty) of each tab — and the planos single-plan view — not on the brief loading/error spinner states (which render bare full-screen Views). This keeps the change focused (no View→Screen conversions) while the brand is present on every state a user actually dwells on.

---

## File Structure

- Create: `apps/mobile/components/brand/logo-horizontal.tsx` — icon + "iNutri" wordmark SVG, tone-aware. (Task 1)
- Create: `apps/mobile/components/brand/logo-horizontal.test.tsx` — tone map + smoke render. (Task 1)
- Create: `apps/mobile/components/brand/brand-header.tsx` — the thin centered bar. (Task 2)
- Create: `apps/mobile/components/brand/brand-header.test.tsx` — renders mark + tone-by-scheme. (Task 2)
- Modify: `apps/mobile/components/ui/screen.tsx` — optional fixed `header` slot. (Task 3)
- Modify: `apps/mobile/components/ui/screen.test.tsx` (create) — header renders above content. (Task 3)
- Modify: `apps/mobile/app/(app)/index.tsx`, `apps/mobile/app/(app)/fora-de-casa.tsx`, `apps/mobile/app/(app)/configuracoes/index.tsx` — pass `header`. (Task 4)
- Modify: `apps/mobile/app/(app)/planos/index.tsx` + `apps/mobile/components/meal-plan/meal-plan-view.tsx` — pass `header`; `MealPlanView` header passthrough (planos/[id] stays header-free). (Task 5)

---

## Task 1: `LogoHorizontal` component

Ports `apps/web/public/brand/inutri-logo-horizontal.svg` (icon + "iNutri" wordmark) to react-native-svg, with the same tone model as `components/brand/logo.tsx`.

**Files:**
- Create: `apps/mobile/components/brand/logo-horizontal.tsx`
- Test: `apps/mobile/components/brand/logo-horizontal.test.tsx`

**Interfaces:**
- Produces: `LogoHorizontal({ tone?: 'color' | 'reverse' | 'dark'; height?: number })` (default `tone='color'`, `height=24`); `LOGO_TONES: Record<LogoTone, { teal: string; green: string }>` (exported for the test).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/components/brand/logo-horizontal.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import { LogoHorizontal, LOGO_TONES } from './logo-horizontal';

describe('LogoHorizontal tones', () => {
  it('keeps brand teal + green for the color tone', () => {
    expect(LOGO_TONES.color).toEqual({ teal: '#14BFA6', green: '#0A5C45' });
  });

  it('lifts the green parts to light on the dark tone', () => {
    expect(LOGO_TONES.dark).toEqual({ teal: '#14BFA6', green: '#E7ECE9' });
  });

  it('is solid white on the reverse tone', () => {
    expect(LOGO_TONES.reverse).toEqual({ teal: '#FFFFFF', green: '#FFFFFF' });
  });
});

describe('LogoHorizontal', () => {
  it('renders the iNutri mark', async () => {
    await render(<LogoHorizontal />);
    expect(screen.getByLabelText('iNutri')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile exec jest components/brand/logo-horizontal.test.tsx`
Expected: FAIL — `./logo-horizontal` does not exist.

- [ ] **Step 3: Implement `logo-horizontal.tsx`**

Create `apps/mobile/components/brand/logo-horizontal.tsx` (paths transcribed verbatim from the web SVG; `#14BFA6` → `teal`, `#0A5C45` → `green`):

```tsx
import Svg, { Path } from 'react-native-svg';

type LogoTone = 'color' | 'reverse' | 'dark';

type LogoHorizontalProps = {
  /**
   * `color` — teal + green, for light surfaces. `reverse` — solid white, for
   * saturated surfaces. `dark` — teal accents kept, green parts lifted to the
   * light foreground so the mark stays legible on the near-black app background.
   */
  tone?: LogoTone;
  height?: number;
};

// Horizontal lockup (icon + "iNutri" wordmark) — same artwork as the web's
// apps/web/public/brand/inutri-logo-horizontal.svg.
const VIEWBOX_WIDTH = 952;
const VIEWBOX_HEIGHT = 300;

export const LOGO_TONES: Record<LogoTone, { teal: string; green: string }> = {
  color: { teal: '#14BFA6', green: '#0A5C45' },
  reverse: { teal: '#FFFFFF', green: '#FFFFFF' },
  dark: { teal: '#14BFA6', green: '#E7ECE9' },
};

export function LogoHorizontal({ tone = 'color', height = 24 }: LogoHorizontalProps) {
  const { teal, green } = LOGO_TONES[tone];
  const width = (height * VIEWBOX_WIDTH) / VIEWBOX_HEIGHT;

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      fill="none"
      accessibilityRole="image"
      aria-label="iNutri"
    >
      <Path d="M39 120V180C39 215 61.5 235 89 235" stroke={teal} strokeWidth={37.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M86.5 235C114 235 129 217.5 129 190V160C129 148.065 133.741 136.619 142.18 128.18C150.619 119.741 162.065 115 174 115C185.935 115 197.381 119.741 205.82 128.18C214.259 136.619 219 148.065 219 160V235" stroke={green} strokeWidth={37.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M39 91.25C50.736 91.25 60.25 81.736 60.25 70C60.25 58.2639 50.736 48.75 39 48.75C27.2639 48.75 17.75 58.2639 17.75 70C17.75 81.736 27.2639 91.25 39 91.25Z" fill={teal} />
      <Path d="M321.78 223V102.44H356.98V223H321.78ZM305.72 128.4V102.44H356.98V128.4H305.72ZM335.42 90.56C328.82 90.56 323.907 88.8733 320.68 85.5C317.6 81.98 316.06 77.58 316.06 72.3C316.06 66.8733 317.6 62.4733 320.68 59.1C323.907 55.58 328.82 53.82 335.42 53.82C342.02 53.82 346.86 55.58 349.94 59.1C353.167 62.4733 354.78 66.8733 354.78 72.3C354.78 77.58 353.167 81.98 349.94 85.5C346.86 88.8733 342.02 90.56 335.42 90.56Z" fill={teal} />
      <Path d="M389.537 223V102.44H417.477V154.14H415.497C415.497 141.82 417.037 131.553 420.117 123.34C423.343 115.127 428.183 108.967 434.637 104.86C441.09 100.753 448.937 98.7 458.177 98.7H459.717C473.797 98.7 484.503 103.32 491.837 112.56C499.317 121.653 503.057 135.513 503.057 154.14V223H467.857V152.16C467.857 145.707 465.95 140.427 462.137 136.32C458.323 132.213 453.19 130.16 446.737 130.16C440.137 130.16 434.783 132.287 430.677 136.54C426.717 140.647 424.737 146.073 424.737 152.82V223H389.537ZM573.752 226.74C559.819 226.74 549.112 222.267 541.632 213.32C534.152 204.227 530.412 190.587 530.412 172.4V102.44H565.612V174.16C565.612 180.613 567.446 185.747 571.112 189.56C574.779 193.373 579.692 195.28 585.852 195.28C592.159 195.28 597.292 193.3 601.252 189.34C605.212 185.38 607.192 180.027 607.192 173.28V102.44H642.392V223H614.452V172.18H616.872C616.872 184.353 615.259 194.547 612.032 202.76C608.952 210.827 604.332 216.84 598.172 220.8C592.012 224.76 584.386 226.74 575.292 226.74H573.752ZM729.629 224.54C717.456 224.54 707.629 223.073 700.149 220.14C692.669 217.06 687.169 212 683.649 204.96C680.276 197.773 678.589 188.093 678.589 175.92V69.88H711.369V177.24C711.369 182.96 712.836 187.36 715.769 190.44C718.849 193.373 723.176 194.84 728.749 194.84H746.569V224.54H729.629ZM660.329 128.18V102.44H746.569V128.18H660.329ZM770.24 223V102.44H798.18V154.14H797.52C797.52 137.127 801.113 124 808.3 114.76C815.633 105.52 826.193 100.9 839.98 100.9H844.6V131.26H835.8C826.12 131.26 818.64 133.9 813.36 139.18C808.08 144.313 805.44 151.793 805.44 161.62V223H770.24ZM879.557 223V102.44H914.757V223H879.557ZM863.497 128.4V102.44H914.757V128.4H863.497ZM893.197 90.56C886.597 90.56 881.684 88.8733 878.457 85.5C875.377 81.98 873.837 77.58 873.837 72.3C873.837 66.8733 875.377 62.4733 878.457 59.1C881.684 55.58 886.597 53.82 893.197 53.82C899.797 53.82 904.637 55.58 907.717 59.1C910.944 62.4733 912.557 66.8733 912.557 72.3C912.557 77.58 910.944 81.98 907.717 85.5C904.637 88.8733 899.797 90.56 893.197 90.56Z" fill={green} />
    </Svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nutri-plus/mobile exec jest components/brand/logo-horizontal.test.tsx`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/brand/logo-horizontal.tsx apps/mobile/components/brand/logo-horizontal.test.tsx
git commit -m "feat(mobile): LogoHorizontal (icon + wordmark) brand lockup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `BrandHeader` component

The thin centered bar; picks the tone from the theme scheme.

**Files:**
- Create: `apps/mobile/components/brand/brand-header.tsx`
- Test: `apps/mobile/components/brand/brand-header.test.tsx`

**Interfaces:**
- Consumes: `LogoHorizontal` (Task 1); `useTheme` from `../../lib/theme` (returns `{ scheme: 'light' | 'dark' }`).
- Produces: `BrandHeader()` — no props.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/components/brand/brand-header.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';

let mockScheme: 'light' | 'dark' = 'dark';
jest.mock('../../lib/theme', () => ({ useTheme: () => ({ scheme: mockScheme }) }));

// Must be `mock`-prefixed to be referenced inside a jest.mock factory.
let mockTone: string | undefined;
jest.mock('./logo-horizontal', () => ({
  LogoHorizontal: (props: { tone?: string }) => {
    mockTone = props.tone;
    return null;
  },
}));

import { BrandHeader } from './brand-header';

beforeEach(() => {
  mockTone = undefined;
});

describe('BrandHeader', () => {
  it("uses the 'dark' tone on the dark scheme", async () => {
    mockScheme = 'dark';
    await render(<BrandHeader />);
    expect(mockTone).toBe('dark');
  });

  it("uses the 'color' tone on the light scheme", async () => {
    mockScheme = 'light';
    await render(<BrandHeader />);
    expect(mockTone).toBe('color');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile exec jest components/brand/brand-header.test.tsx`
Expected: FAIL — `./brand-header` does not exist.

- [ ] **Step 3: Implement `brand-header.tsx`**

Create `apps/mobile/components/brand/brand-header.tsx`:

```tsx
import { View } from 'react-native';
import { useTheme } from '../../lib/theme';
import { LogoHorizontal } from './logo-horizontal';

// Thin, fixed brand bar for the main tab screens. On the near-black app
// background the mark uses the 'dark' tone (teal + light wordmark); on the
// light theme it uses the full-color 'color' tone.
export function BrandHeader() {
  const { scheme } = useTheme();
  return (
    <View className="items-center border-b border-border bg-background py-3">
      <LogoHorizontal height={20} tone={scheme === 'light' ? 'color' : 'dark'} />
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nutri-plus/mobile exec jest components/brand/brand-header.test.tsx`
Expected: PASS (2 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/brand/brand-header.tsx apps/mobile/components/brand/brand-header.test.tsx
git commit -m "feat(mobile): BrandHeader — theme-aware brand bar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `Screen` optional fixed header slot

**Files:**
- Modify: `apps/mobile/components/ui/screen.tsx`
- Test: `apps/mobile/components/ui/screen.test.tsx`

**Interfaces:**
- Produces: `Screen` gains `header?: ReactNode`. When provided, it renders fixed above the scroll area (within the existing top-inset padding). Existing callers (no `header`) are unaffected.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/components/ui/screen.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Screen } from './screen';

describe('Screen header slot', () => {
  it('renders a passed header above the content', async () => {
    await render(
      <Screen header={<Text>BRAND</Text>}>
        <Text>body</Text>
      </Screen>,
    );
    expect(screen.getByText('BRAND')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('renders nothing extra when no header is passed', async () => {
    await render(
      <Screen>
        <Text>body</Text>
      </Screen>,
    );
    expect(screen.getByText('body')).toBeTruthy();
    expect(screen.queryByText('BRAND')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nutri-plus/mobile exec jest components/ui/screen.test.tsx`
Expected: FAIL — `header` isn't rendered (only the second case passes; the first fails on "BRAND").

- [ ] **Step 3: Add the header slot**

In `apps/mobile/components/ui/screen.tsx`, add `header` to the props type and render it above the `ScrollView`:

Change the type:

```tsx
type ScreenProps = {
  children: ReactNode;
  /**
   * Optional fixed bar rendered at the top (within the safe-area top inset),
   * above the scroll area — e.g. the brand header. Content scrolls beneath it.
   */
  header?: ReactNode;
  /**
   * Classes for the scroll content container. Default `grow` lets short
   * content fill the viewport (so `justify-center` works) while taller
   * content — or content pushed up by the keyboard — scrolls.
   */
  contentContainerClassName?: string;
};
```

Change the signature + render:

```tsx
export function Screen({ children, header, contentContainerClassName = 'grow' }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {header}
      <ScrollView
        className="flex-1"
        contentContainerClassName={contentContainerClassName}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 4: Run test + type check**

Run: `pnpm --filter @nutri-plus/mobile exec jest components/ui/screen.test.tsx`
Expected: PASS (2 cases).

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/ui/screen.tsx apps/mobile/components/ui/screen.test.tsx
git commit -m "feat(mobile): optional fixed header slot on Screen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Brand header on Evolução, Fora de casa, Configurações

Pass `header={<BrandHeader />}` on the content-state `Screen`s of the three tab screens that don't involve `MealPlanView`. (Loading/error spinner states are left as-is per the scope note.)

**Files:**
- Modify: `apps/mobile/app/(app)/index.tsx`
- Modify: `apps/mobile/app/(app)/fora-de-casa.tsx`
- Modify: `apps/mobile/app/(app)/configuracoes/index.tsx`

**Interfaces:**
- Consumes: `BrandHeader` (Task 2); `Screen` `header` prop (Task 3).

This is presentational wiring; correctness is covered by `tsc` + the full suite (the components are unit-tested in Tasks 1–3). No new per-screen test is added.

- [ ] **Step 1: Evolução — `app/(app)/index.tsx`**

Add the import (after the `Screen` import at line 3):

```tsx
import { BrandHeader } from '../../components/brand/brand-header';
```

Add `header={<BrandHeader />}` to both content-state `Screen`s:

- The empty state (currently `<Screen contentContainerClassName="grow justify-center p-6">`):

```tsx
    <Screen header={<BrandHeader />} contentContainerClassName="grow justify-center p-6">
```

- The data state (currently `<Screen contentContainerClassName="grow p-6">`):

```tsx
    <Screen header={<BrandHeader />} contentContainerClassName="grow p-6">
```

- [ ] **Step 2: Fora de casa — `app/(app)/fora-de-casa.tsx`**

Add the import (after the `Screen` import at line 3):

```tsx
import { BrandHeader } from '../../components/brand/brand-header';
```

Change its single `Screen` (currently `<Screen contentContainerClassName="grow p-6">`):

```tsx
    <Screen header={<BrandHeader />} contentContainerClassName="grow p-6">
```

- [ ] **Step 3: Configurações — `app/(app)/configuracoes/index.tsx`**

Add the import (after the `Screen` import at line 8):

```tsx
import { BrandHeader } from '../../../components/brand/brand-header';
```

Change its single `Screen` (currently `<Screen contentContainerClassName="grow p-6">`):

```tsx
    <Screen header={<BrandHeader />} contentContainerClassName="grow p-6">
```

- [ ] **Step 4: Type check + full suite**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter @nutri-plus/mobile test`
Expected: green. (The existing `app/(app)/configuracoes/index.test.tsx` mocks `lib/theme` with a `scheme`, so the real `BrandHeader` renders fine there.)

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/app/(app)/index.tsx" "apps/mobile/app/(app)/fora-de-casa.tsx" "apps/mobile/app/(app)/configuracoes/index.tsx"
git commit -m "feat(mobile): brand header on Evolução, Fora de casa, Configurações

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Brand header on Planos (incl. single-plan `MealPlanView`)

Planos shows the header on its empty + multi-plan states directly, and on the single-plan case via a new `header` passthrough on `MealPlanView`. The `planos/[id]` detail screen keeps NO header (it passes nothing).

**Files:**
- Modify: `apps/mobile/components/meal-plan/meal-plan-view.tsx`
- Modify: `apps/mobile/app/(app)/planos/index.tsx`

**Interfaces:**
- Consumes: `BrandHeader` (Task 2); `Screen` `header` prop (Task 3).
- Produces: `MealPlanView({ planId: string; header?: ReactNode })` — `header` is forwarded to its data-state `Screen`.

- [ ] **Step 1: Add the `header` passthrough to `MealPlanView`**

In `apps/mobile/components/meal-plan/meal-plan-view.tsx`, add the `ReactNode` import and the prop, and forward it to the data-state `Screen`.

Change the top import (line 1) to include `ReactNode`:

```tsx
import { useState, type ReactNode } from 'react';
```

Change the signature (line 11):

```tsx
export function MealPlanView({ planId, header }: { planId: string; header?: ReactNode }) {
```

Change the data-state `Screen` (line 49, currently `<Screen contentContainerClassName="grow p-6">`):

```tsx
    <Screen header={header} contentContainerClassName="grow p-6">
```

(The loading/error states are left as-is; `[id]` calls `MealPlanView` without `header`, so `header` is `undefined` there and `Screen` renders no bar — unchanged behavior.)

- [ ] **Step 2: Wire the header into `planos/index.tsx`**

In `apps/mobile/app/(app)/planos/index.tsx`, add the import (after the `MealPlanView` import at line 6):

```tsx
import { BrandHeader } from '../../../components/brand/brand-header';
```

Empty state (currently `<Screen contentContainerClassName="grow justify-center p-6">`):

```tsx
      <Screen header={<BrandHeader />} contentContainerClassName="grow justify-center p-6">
```

Single-plan state (currently `return <MealPlanView planId={plans[0].id} />;`):

```tsx
    return <MealPlanView planId={plans[0].id} header={<BrandHeader />} />;
```

Multi-plan state (currently `<Screen contentContainerClassName="grow p-6">`):

```tsx
    <Screen header={<BrandHeader />} contentContainerClassName="grow p-6">
```

- [ ] **Step 3: Confirm `planos/[id]` stays header-free**

Read `apps/mobile/app/(app)/planos/[id].tsx` and confirm it renders `MealPlanView` WITHOUT a `header` prop (no change needed — this step is a verification, not an edit). If it passes a `header`, remove it.

- [ ] **Step 4: Type check + full suite**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter @nutri-plus/mobile test`
Expected: green (existing meal-plan-view / planos tests unaffected — `header` defaults to `undefined`).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/meal-plan/meal-plan-view.tsx "apps/mobile/app/(app)/planos/index.tsx"
git commit -m "feat(mobile): brand header on Planos (incl. single-plan view)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` — clean.
- `pnpm --filter @nutri-plus/mobile test` — green (baseline 84 + Tasks 1–3's new tests).
- Manual (Expo Go): the iNutri icon + wordmark appears centered at the top of Evolução, Planos, Fora de casa, and Configurações; it adapts between light and dark (green wordmark on light, light wordmark on dark); the meal-plan detail (`planos/[id]`) and change-password (`configuracoes/senha`) screens do NOT show it.
