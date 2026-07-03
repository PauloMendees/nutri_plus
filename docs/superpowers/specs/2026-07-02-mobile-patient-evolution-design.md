# Mobile logged-in app — Patient evolution (bioimpedance) home + tab shell — Design

**Date:** 2026-07-02
**Status:** Approved (pending implementation plan)
**Scope:** Build the first **logged-in** patient screen for the mobile app: an **Evolução (bioimpedance)** home that shows the patient's body-assessment progress — a snapshot of the latest assessment plus trend charts over time. Restructure the authenticated tab shell to three bottom tabs — **Evolução** (home, opens on login), **Planos** (placeholder), **Configurações** (placeholder + logout). Add a patient-facing `GET /v1/me/assessments` endpoint. Read-only in the app (a nutritionist enters assessments via the web).
**Builds on:** the merged mobile foundation (`apps/mobile`: Expo SDK 54, Expo Router `(app)` tab group, `Screen`/`TextField`/`Button`, `apiFetch`, React Query, `useSession`, `react-native-svg` already a dependency); the API `BodyAssessment` model + nutritionist assessment endpoints; the patient-facing `me/meal-plans` controller pattern; `@nutri-plus/shared-types` `BodyAssessment`. New feature branch `feat/mobile-patient-evolution` (branched from `main`).

---

## 1. Goal

A logged-in patient opens the app and lands on **Evolução**, seeing at a glance how they're progressing: the latest assessment's key numbers (with deltas vs. the previous one) and trend charts. Done when: entering `(app)` opens the Evolução tab; it fetches the caller's own assessments from `GET /v1/me/assessments`; it shows a latest-assessment snapshot (Peso, % Gordura, Massa muscular, IMC) with up/down deltas, three trend line charts (weight, body-fat %, muscle mass), and a grid of the remaining metrics; loading/error/empty states are handled; two more bottom tabs (Planos, Configurações) exist with icons, Configurações keeps a working "Sair"; and the whole thing runs in Expo Go (no native chart module).

## 2. Context

- **Data model (`BodyAssessment`, already in shared-types):** `assessmentDate` + nullable metrics `weight`, `bodyFatPercentage`, `muscleMass`, `leanMass`, `visceralFat`, `basalMetabolicRate`, `bodyWaterPercentage`, `boneMass`, `metabolicAge`, and circumferences `waist`/`hip`/`chest`/`arm`/`thigh`, `notes`. The patient profile has `height` (cm) → BMI is computable (`weight / (height/100)^2`).
- **API today:** assessment CRUD is nutritionist-facing (`/patients/:id/assessments`). A patient-facing surface exists for meal plans (`me/meal-plans` controller, `@Roles(PATIENT)`, resolves the caller via `ctx.user.patientProfile.id`). There is **no `me/assessments`** yet.
- **Mobile today:** `(app)/_layout.tsx` renders a 3-tab `Tabs` (index "Início", planos "Planos", perfil "Perfil") with **no icons**; `index.tsx`/`planos.tsx`/`perfil.tsx` are placeholders; `perfil` has the "Sair" (signOut). `apiFetch<T>(path)` hits `${EXPO_PUBLIC_API_URL}/v1${path}` with the bearer token; React Query is available; `react-native-svg` is already a direct dependency (used by the logo).

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Home screen | **Evolução (bioimpedance)** — default `(app)` route, opens on login. |
| Tabs | Three: **Evolução** / **Planos** (placeholder) / **Configurações** (placeholder + Sair). Icons via `@expo/vector-icons` (bundled with Expo, no new dep). |
| Secondary tabs scope | Placeholders this slice; Configurações keeps the logout. Real meal-plan UI + full settings are later slices. |
| Headline metrics (charts) | **Peso, % Gordura, Massa muscular** as trend line charts; **IMC** computed (weight + height) shown as a snapshot tile. |
| Other metrics | Shown as a grid of the **latest** assessment (visceral fat, BMR, water %, bone mass, metabolic age, circumferences), "—" for nulls. |
| Charts | **Custom minimal SVG line chart** built on `react-native-svg` (already a dep). No new dependency — Expo-Go-safe, on-brand (teal), fine for the small per-patient datasets. (Rejected: victory-native/Skia — native module, breaks Expo Go; chart-kit/gifted-charts — avoidable extra deps.) |
| App ↔ assessments | **Read-only.** Patients view; the nutritionist enters assessments on the web. |
| Backend | New `GET /v1/me/assessments` returning `{ name, height, assessments }` for the caller. |

## 4. Backend — `GET /v1/me/assessments`

- **New controller** in the patients module — `PatientAssessmentsController`, `@Controller({ path: 'me/assessments', version: '1' })`, `@Roles(UserRole.PATIENT)`, `@ApiBearerAuth()` — mirroring `PatientMealPlansController`. One route: `@Get() list(@CurrentUser() ctx) → patients.listMyAssessments(ctx)`.
- **`PatientsService.listMyAssessments(ctx)`** — resolves the caller's own `patientProfile` (via `ctx.user.patientProfile.id`, the same ownership source meal-plans uses), and returns:
  - `name` — the caller's display name (from the linked `User`).
  - `height` — the patient's `height` (cm) or `null`.
  - `assessments` — `bodyAssessment.findMany({ where: { patientId }, orderBy: { assessmentDate: 'asc' } })`, mapped to the `BodyAssessment` wire shape (dates as ISO strings).
- Scoped strictly to the caller — a patient can only read their own assessments. No pagination (a patient's assessment history is small).

## 5. shared-types (`packages/shared-types/src/v1`)

- Reuse `BodyAssessment` (already defined).
- Add `MyEvolutionResponse { name: string; height: number | null; assessments: BodyAssessment[] }` in `assessment.ts`; export from `index.ts`. This is the `GET /me/assessments` response.

## 6. Mobile — data layer

- **`lib/api/assessments.ts`** — `getMyEvolution(): Promise<MyEvolutionResponse>` → `apiFetch('/me/assessments')`.
- **`lib/queries/assessments.ts`** (or inline hook) — `useMyEvolution()` = `useQuery({ queryKey: ['me', 'assessments'], queryFn: getMyEvolution })`.

## 7. Mobile — tab shell (`app/(app)`)

- `_layout.tsx`: keep the session guard; the `Tabs` gets three screens **in this order** (first = default on entering `(app)`):
  1. `index` → title **"Evolução"**, `tabBarIcon` (e.g. Ionicons `pulse`/`trending-up`).
  2. `planos` → title **"Planos"**, icon `restaurant`/`nutrition`.
  3. `configuracoes` → title **"Config"**, icon `settings`.
  Keep the existing dark tab-bar styling (`#141d19` bg, `#243029` border, `#14bfa6` active tint).
- **Rename** `perfil.tsx` → `configuracoes.tsx` (keeps the patient e-mail + a working "Sair" via `useSession().signOut`). `planos.tsx` stays a placeholder ("em breve").

## 8. Mobile — Evolução screen (`app/(app)/index.tsx`)

Rendered inside `Screen` (scroll). Consumes `useMyEvolution()`.

- **Greeting** — "Olá, {name}" + subtitle "Sua evolução".
- **Latest snapshot** — a card with the latest `assessmentDate` (formatted pt-BR) and four metric tiles: **Peso** (kg), **% Gordura**, **Massa muscular** (kg), **IMC** (computed `weight / (height/100)^2`, shown only when both weight and height exist). Each tile shows the **delta vs. the previous assessment** (arrow + signed value, colored; neutral when no previous or metric null).
- **Trends** — three `LineChart`s (Peso, % Gordura, Massa muscular). For each metric, the screen builds the ordered list of assessments whose value for that metric is non-null and passes **x = the point's sequential index in that filtered list (equal spacing)**, y = the metric value. (No date axis this slice — dates live in the snapshot, not on the chart.) With fewer than 2 such points → render the single value / a "sem histórico suficiente para tendência ainda" note instead of a line.
- **Full metrics grid** — the remaining latest-assessment metrics (visceral fat, BMR, water %, bone mass, metabolic age, waist/hip/chest/arm/thigh) as labeled rows/tiles, `—` when null.
- **States** — loading (skeleton/spinner), error (message + "Tentar de novo" refetch), **empty** (no assessments → "Suas avaliações aparecerão aqui após sua consulta.").

## 9. Mobile — chart component (`components/chart/line-chart.tsx`)

- Props: `data: { x: number; y: number }[]` (x is the caller-provided numeric position — the screen passes the point's sequential index), plus `width`/`height`/`color` (default teal `#14bfa6`), optional formatted last-value label.
- Renders with `react-native-svg`: scales y to `[min,max]` (with padding), maps points to a `Path` polyline, draws 2–3 faint horizontal guide lines, and a dot + value at the most recent point. Pure, deterministic, themed to the app palette.
- Degenerate inputs handled: `0` points → renders nothing / caller shows the empty note; `1` point → a single dot (no line). No axis library, no animation this slice.

## 10. Error handling / states

Network/API failure → the screen's error state with retry (not a crash). Missing metrics are individually nullable → tiles/rows show "—" and charts skip null points. Empty history → the empty state. Auth is already enforced by the `(app)` layout guard + the endpoint's `@Roles(PATIENT)`; a non-patient calling `me/assessments` is rejected by the roles guard.

## 11. Testing

- **API (jest):** `listMyAssessments` — scoped to `ctx` patient; orders assessments by `assessmentDate asc`; returns `{ name, height, assessments }`; a patient with no assessments returns an empty list (+ name/height).
- **Mobile (jest-expo + @testing-library/react-native; mock supabase + apiFetch):**
  - `LineChart` — renders a path for ≥2 points; renders a single dot for 1 point; renders nothing for 0 points.
  - Evolução screen — loading state; empty state (no assessments); with mocked data renders the latest tiles (Peso/%Gordura/Massa/IMC) + deltas and the three charts + the metrics grid; error state shows retry.
  - `getMyEvolution` hits `/me/assessments`; `useMyEvolution` uses the `['me','assessments']` key.
- Follow existing mobile test patterns (`getByText`/`getByLabelText`, async `render`/`fireEvent`).

## 12. Out of scope

Real Planos alimentares UI (later slice, `me/meal-plans` already exists); full Configurações beyond e-mail + Sair; creating/editing assessments from the app; per-assessment drill-down/history detail; date-axis ticks / interactive tooltips / animated charts; push notifications; offline caching.
