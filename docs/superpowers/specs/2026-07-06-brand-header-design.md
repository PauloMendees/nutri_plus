# Brand Header (logomarca no topo) — Design

**Date:** 2026-07-06
**Status:** Approved (design), pending spec review

## Goal

Reinforce the iNutri brand inside the app by placing the logo at the top of the
main screens: a thin, fixed header bar showing the **icon + "iNutri" wordmark**,
centered, present on the four main tab screens and adapting to the light/dark
theme.

## Overview

Mobile-only, presentational. No API, no shared-types, no database migration.
The chosen placement (from a mockup comparison) is a centered icon+wordmark in a
thin fixed top bar. It reuses the existing `Logo` component's `tone` model and
the theme scheme added in the settings feature.

## Decisions (from brainstorming)

- **Placement:** a thin fixed bar at the top of the four main tab screens
  (below the status bar). Not the tab-bar center (it crowds the 4-tab layout and
  a decorative center button reads as tappable-but-inert).
- **Content:** icon + "iNutri" wordmark, **centered**.
- **Theme-aware:** dark theme → `dark` tone (teal + light wordmark); light theme
  → `color` tone (teal + green), matching the login logo and the theme toggle.
- **Divider:** a hairline bottom border (`border-border`) separates the bar from
  content.
- **Sub-screens** (planos/[id], configuracoes/senha) stay header-free.

## Components

### 1. `LogoHorizontal` — `apps/mobile/components/brand/logo-horizontal.tsx`

Ports the web horizontal lockup (`apps/web/public/brand/inutri-logo-horizontal.svg`)
to `react-native-svg`. It is the icon + "iNutri" wordmark as vector paths (exact
brand lettering, not a system-font approximation). It mirrors the existing
`components/brand/logo.tsx`:

- Props: `tone?: 'color' | 'reverse' | 'dark'` (default `color`), `height?: number`.
- Same `TONES` map as `Logo`: `color` = teal `#14BFA6` + green `#0A5C45`;
  `reverse` = white/white; `dark` = teal `#14BFA6` + light `#E7ECE9`.
- The source SVG's `#14BFA6` fills/strokes map to the tone's `teal`; `#0A5C45`
  map to the tone's `green`.
- `viewBox="0 0 952 300"`; width derived from `height` (952/300 ratio).
- `accessibilityRole="image"`, `aria-label="iNutri"`.

### 2. `BrandHeader` — `apps/mobile/components/brand/brand-header.tsx`

The thin bar. Renders `<LogoHorizontal height={20} tone={tone} />` centered in a
row with a hairline bottom border:

- Reads `useTheme().scheme` (from `lib/theme`); `tone = scheme === 'light' ? 'color' : 'dark'`.
- Layout: `items-center justify-center border-b border-border`, vertical padding
  ~`py-3`, `bg-background` (so it matches the screen ground).
- No interactivity (pure branding).

### 3. `Screen` gains an optional fixed header — `apps/mobile/components/ui/screen.tsx`

Add `header?: ReactNode` to `ScreenProps`. When provided, `Screen` renders it as
a **fixed** bar at the top — inside the existing top-inset padding, above the
`ScrollView` (which keeps `flex-1` and scrolls beneath it). When omitted,
`Screen` behaves exactly as today (no layout change for existing callers).

The keyboard-avoiding + safe-area top-inset handling stays in `Screen` (single
place); the header sits within that inset so it clears the status bar / notch.

### 4. Wiring

The four main tab screens pass `header={<BrandHeader />}` to their `Screen`:

- `app/(app)/index.tsx` (Evolução) — all render states (loading / error / data).
- `app/(app)/planos/index.tsx` (Planos) — all render states.
- `app/(app)/fora-de-casa.tsx` (Fora de casa).
- `app/(app)/configuracoes/index.tsx` (Configurações).

The header goes on the **content** render states (data + empty) and the planos
single-plan view. The brief loading/error spinner states (bare full-screen
`View`s) are intentionally left header-free — this keeps the change focused (no
`View`→`Screen` conversions); on a slow first load the bar appears with the
content. The brand is present on every state a user actually dwells on.

## Testing

- `LogoHorizontal`: renders an SVG labeled "iNutri"; a `dark`-tone render uses
  the light secondary color and a `color`-tone render uses the green — assert on
  the rendered path stroke/fill props.
- `BrandHeader`: renders the `iNutri` mark (query by the `iNutri` a11y label);
  chooses the tone from the theme scheme (mock `useTheme`).
- `Screen`: when a `header` is passed, it renders above the content; when
  omitted, nothing extra renders (existing behavior).

## Global constraints

- SINGLE quotes in new files; pt-BR user copy (none needed here — the mark is a
  logo).
- Reuse the existing `Logo`/`tone` pattern; no new UI primitives beyond the two
  brand components + the `Screen` header slot.
- Expo Go must keep working (only `react-native-svg`, already a dependency).
- Do not reintroduce `node-linker=hoisted`; never commit `.env` or `.expo/`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do not push/PR unless asked.
