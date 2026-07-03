# Patient meal plans (visibility + app viewer + PDF) & "Fora de casa" AI — Design

**Date:** 2026-07-02
**Status:** Approved (pending implementation plan)
**Scope:** Three coupled pieces, one spec, built in order **A → B → C**:
- **A. Meal-plan visibility** — the nutritionist marks which meal plans are visible to the patient; the patient app only sees visible plans (web + api).
- **B. Patient meal-plan viewing + PDF** — the app lists visible plans (auto-open when 1, pick when >1), renders the plan, and downloads the PDF (mobile + api).
- **C. "Fora de casa" AI assistant** (doc `docs/08-outside-home-feature.md`) — a dedicated app tab where the patient describes where they are and the AI suggests what to eat, aligned with their goal/restrictions/current plan (api + mobile).
**Builds on:** the meal-plan domain (`MealPlan → Meal → MealOption → MealItem`, `MealPlansService`, the `me/meal-plans` patient controller, the pdfmake `MealPlanPdfService`, nutritionist `MealPlansController` + web `MealPlansSection`), the AI infra (`OpenAIProvider.generateStructured`, `AiInteractionsService`, `AIInteractionType`, mirrored on `meal-generation.service`), the mobile foundation (Expo Router `(app)` tabs, `Screen`/`TextField`/`Button`, `apiFetch`, React Query, `resolveScopePatientId`), and `@nutri-plus/shared-types`. New feature branch `feat/patient-meal-plans-outside-home` (off `main`).

---

## 1. Goal

A nutritionist controls which plans a patient sees; the patient opens the app, views their available plan(s), downloads a plan PDF, and can ask an "outside home" AI assistant what to eat when away. Done when: the web has a per-plan visibility toggle; `GET /v1/me/meal-plans` returns only visible plans and a hidden plan is not openable by id; the app's **Planos** tab auto-opens the single visible plan or shows a picker for several, renders the full plan, and downloads the PDF via the share sheet; a **Fora de casa** tab takes a free-text situation and returns one AI suggestion aligned with the patient's plan/goal/restrictions; everything is patient-scoped and runs in Expo Go.

## 2. Context

- **Data model:** `MealPlan` (title, objective, aiGenerated, target{Calories,Protein,Carbs,Fats}, timestamps) → `Meal` (name, timeLabel, instructions, order) → `MealOption` (label, order) → `MealItem` (foodName, quantity, calories/protein/carbs/fats, order). **No visibility field today.** `PatientProfile` has `objective`, `activityLevel`, `restrictions`, `allergies`, `medicalConditions`, `notes`, `nutritionistId`, `height`.
- **API today:** nutritionist `MealPlansController` (`meal-plans`, `@Roles(NUTRITIONIST[/EMPLOYEE])`) with CRUD + `GET :id/pdf` (StreamableFile via `MealPlanPdfService.generate(ctx,id)` → `getPlan(ctx,id)` nutritionist-scoped + branding via `resolveScopeNutritionistId`). Patient `PatientMealPlansController` (`me/meal-plans`, `@Roles(PATIENT)`) → `listMyPlans` (all rows, no visibility filter) + `getMyPlan` (FULL_TREE). Ownership via `patientProfileId(ctx)`.
- **AI infra:** `OpenAIProvider.generateStructured<T>({ tier: 'smart'|'fast', system, user, schema, schemaName, type: AIInteractionType, patientId })` (validates, logs). `AIInteractionType` already includes **`OUTSIDE_HOME_SUGGESTION`** (no enum change needed). `meal-generation.service` is the reference consumer.
- **Mobile today:** 3-tab `(app)` shell (Evolução / Planos / Config); `planos.tsx` is a placeholder. `apiFetch<T>(path)` (bearer + `/v1`). `expo-file-system` / `expo-sharing` are **not** installed.
- **Web today:** `MealPlansSection` lists `MealPlanSummary`s with per-plan actions.

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Visibility default | **Hidden (opt-in)**. New + existing plans default `false`; the nutritionist marks a plan visible. |
| Visibility write | Dedicated `PATCH /v1/meal-plans/:id/visibility` (flag only) — does NOT rebuild the meal tree. |
| Hidden plan by id | `getMyPlan` also requires `visibleToPatient: true` → a hidden plan 404s for the patient. |
| App plan navigation | 0 visible → empty state; **1 → auto-open** the viewer; **>1 → picker**, tap to open. |
| PDF on mobile | Download the authenticated PDF (`expo-file-system.downloadAsync` with the Bearer header) then open the OS share sheet (`expo-sharing`). Expo-Go-safe; no embedded viewer. |
| Patient PDF branding | Resolved from the **patient's own nutritionist** (`patient.nutritionistId`), since the caller is a PATIENT. |
| "Fora de casa" placement | **Dedicated 4th bottom tab** (Evolução / Planos / Fora de casa / Config). |
| "Fora de casa" depth | **Single-shot** (ask → one suggestion). Backend logs every request; the app shows no history list. |
| "Fora de casa" AI context | The patient's **latest visible plan** (+ objective/restrictions/allergies/medicalConditions/notes). If no visible plan, proceed with profile context only. |
| AI reuse | `OpenAIProvider.generateStructured` (tier `fast`, `type: OUTSIDE_HOME_SUGGESTION`), mirroring `meal-generation.service`. |

## 4. Part A — Meal-plan visibility (web + api)

- **Prisma:** add `visibleToPatient Boolean @default(false)` to `MealPlan` (additive migration on the shared dev DB; existing rows become `false`).
- **shared-types:** add `visibleToPatient: boolean` to `MealPlan` (`MealPlanSummary = Omit<MealPlan,'meals'>` inherits it). New `SetMealPlanVisibilityRequest { visibleToPatient: boolean }`.
- **API — write:** `PATCH /v1/meal-plans/:id/visibility` on `MealPlansController` (`@Roles(NUTRITIONIST, EMPLOYEE)`); `MealPlansService.setVisibility(ctx, id, visibleToPatient)` — `requireOwnedPlan(ctx, id)` (existing scope check) then `mealPlan.update({ where:{id}, data:{ visibleToPatient } })`. No tree writes.
- **API — read filter:** `listMyPlans` → `where: { patientId, visibleToPatient: true }`; `getMyPlan` → add `visibleToPatient: true` to the `where`.
- **Web:** in `MealPlansSection`, each plan row gets a "Disponível para o paciente" toggle (shadcn `Switch`) bound to `plan.visibleToPatient`; on change it calls a new `useSetMealPlanVisibility` mutation (→ `PATCH …/visibility`) that invalidates `['meal-plans', patientId]` (or the existing plans query key). Follows the section's existing mutation/invalidation conventions.

## 5. Part B — App: view + PDF (mobile + api)

- **API — patient PDF:** `GET /v1/me/meal-plans/:id/pdf` on `PatientMealPlansController` (`@Roles(PATIENT)`) → `StreamableFile` (`application/pdf`, `attachment; filename="plano-alimentar.pdf"`). `MealPlanPdfService.generateForPatient(ctx, id)`: load the plan via `getMyPlan(ctx, id)` (patient-scoped + visible; 404 propagates), resolve branding from the plan's `patient.nutritionistId` (not `ctx`), reuse the existing pdf doc builder. Refactor the shared doc-building so both `generate` (nutritionist) and `generateForPatient` reuse it.
- **shared-types:** none beyond Part A (the app reuses `MealPlan`/`MealPlanSummary`).
- **Mobile deps:** `expo install expo-file-system expo-sharing` (both in the Expo Go SDK).
- **Mobile data layer:** `lib/queries/meal-plans.ts` — `useMyMealPlans()` (`['me','meal-plans']` → `MealPlanSummary[]`), `useMyMealPlan(id)` (`['me','meal-plans',id]` → `MealPlan`), and `downloadMealPlanPdf(id)` (resolves the session token, `FileSystem.downloadAsync(`${API}/v1/me/meal-plans/${id}/pdf`, fileUri, { headers:{ Authorization } })`, then `Sharing.shareAsync(fileUri)`).
- **Mobile — Planos becomes a nested Stack group** so the picker can push a detail with native back. Replace the flat `(app)/planos.tsx` with a `planos/` directory:
  - `planos/_layout.tsx` — `<Stack screenOptions={{ headerShown: false }} />` (the "planos" tab renders this stack).
  - `planos/index.tsx` — `useMyMealPlans()`: loading → spinner; error → retry; **0** → empty ("Nenhum plano disponível ainda."); **1** → render `<MealPlanView planId={theSingleId} />` **inline** (not a `<Redirect>`, which would loop with back); **>1** → a picker list (title / objective / formatted date), each row an expo-router `Link` to `/planos/[id]`.
  - `planos/[id].tsx` — reads `id` via `useLocalSearchParams`, renders `<MealPlanView planId={id} />` (reached only from the picker).
  - **`components/meal-plan/meal-plan-view.tsx`** — shared `MealPlanView({ planId })`: `useMyMealPlan(planId)` → header (title, objective, target kcal/P/C/F when present), then each meal (timeLabel + name, instructions) with its options (label) and items (foodName, quantity, macros). A **"Baixar PDF"** `Button` → `downloadMealPlanPdf(planId)` (pending + error states). Wrapped in the `Screen` component (scroll + safe area).

## 6. Part C — "Fora de casa" AI assistant (api + mobile)

- **Prisma:** `OutsideHomeRequest { id String @id @default(uuid()); patientId String; patient PatientProfile @relation(...); message String; aiSuggestion String; createdAt DateTime @default(now()); @@index([patientId, createdAt]) }`. (Enum `OUTSIDE_HOME_SUGGESTION` already exists.)
- **API — `outside-home` module:** `POST /v1/me/outside-home { message }` (`@Roles(PATIENT)`, `@ApiBearerAuth()`). `CreateOutsideHomeDto { message: @IsString @IsNotEmpty @MaxLength(500) }`. `OutsideHomeService.suggest(ctx, dto)`:
  1. `patientId = resolveScopePatientId(ctx)`.
  2. Load the patient profile (objective/restrictions/allergies/medicalConditions/notes) and the **latest visible meal plan** (`mealPlan.findFirst({ where:{ patientId, visibleToPatient:true }, orderBy:{ createdAt:'desc' }, include: FULL_TREE })`).
  3. Build the AI context (profile + a compact plan summary + the user's `message`).
  4. `provider.generateStructured<{ suggestion: string }>({ tier:'fast', system: OUTSIDE_HOME_SYSTEM_PROMPT, user: JSON.stringify(context), schema: z.object({ suggestion: z.string() }), schemaName:'outside_home_suggestion', type: AIInteractionType.OUTSIDE_HOME_SUGGESTION, patientId })`.
  5. `prisma.outsideHomeRequest.create({ data:{ patientId, message: dto.message, aiSuggestion: suggestion } })`.
  6. return `{ suggestion }`.
  - `OUTSIDE_HOME_SYSTEM_PROMPT` (pt-BR): practical, concise, aligned with goal/restrictions/plan, **no medical claims** (doc rules). Own-data only (patient scope). Mirrors `meal-generation.service` wiring; new `OutsideHomeModule` importing `AiModule`/`PrismaModule`.
- **shared-types:** `CreateOutsideHomeRequest { message: string }`, `OutsideHomeSuggestion { suggestion: string }` (and optionally an `OutsideHomeRequest` record type, unused by the app this phase).
- **Mobile — new 4th tab `(app)/fora-de-casa.tsx`:** add a `Tabs.Screen name="fora-de-casa"` (title "Fora de casa", Ionicons e.g. `restaurant-outline`/`compass-outline`) to `(app)/_layout.tsx` between Planos and Config. Screen: short intro + a multiline `TextField` ("Onde você está? O que tem disponível?") + a "Pedir sugestão" `Button`; on submit → `POST /me/outside-home` (a `useOutsideHome` mutation) → render the returned `suggestion` in a card. Loading + error states. Single-shot (no history). Reuses `Screen`.

## 7. Error handling / states

Visibility PATCH on a non-owned plan → 404 (existing `requireOwnedPlan`). Patient opening a hidden/non-existent plan → 404. PDF download failure → inline error + retry (no crash). Outside-home: AI/network failure → friendly pt-BR error, the request is only persisted on success; empty message blocked by the DTO + the app's submit guard. All patient endpoints are `@Roles(PATIENT)` + own-scope (no cross-patient access). AI suggestions carry no medical claims (prompt-enforced).

## 8. Testing

- **API (jest):** `listMyPlans`/`getMyPlan` exclude non-visible plans (visible filter in the `where`); `setVisibility` requires ownership then flips only the flag; `generateForPatient` reads via `getMyPlan` and resolves branding from the patient's nutritionist; `OutsideHomeService.suggest` builds context from profile + latest visible plan, calls the AI provider (mocked) with `type: OUTSIDE_HOME_SUGGESTION`, persists the request, returns `{ suggestion }`, and is scoped to the caller. No DTO unit tests (global ValidationPipe convention).
- **Web (vitest + RTL):** the visibility toggle renders per plan, calls the mutation with `{ visibleToPatient }`, and invalidates the list.
- **Mobile (jest-expo + RTL):** Planos states (0 empty / 1 auto-viewer / >1 picker → navigates); the viewer renders header + meals/options/items; "Baixar PDF" calls the download+share path (mock `expo-file-system`/`expo-sharing`); Fora de casa submits and renders the suggestion (loading/error), empty message disabled. shared-types compile.

## 9. Out of scope

Editing plans or assessments from the app; a "fora de casa" history/chat list in the app (backend still logs); restaurant integrations, image, or voice input (doc non-goals); an embedded in-app PDF viewer (we download + share); offline caching; per-meal "visibility."
