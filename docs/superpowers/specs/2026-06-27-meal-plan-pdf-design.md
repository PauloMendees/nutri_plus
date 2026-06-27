# Export meal plan to PDF — Design

**Date:** 2026-06-27
**Status:** Approved (pending implementation plan)
**Scope:** Sub-project **D** of the 4-part batch (A Settings ✅ → B AI instructions ✅ → C meal options ✅ → **D** PDF). Export a meal plan to a branded PDF (the nutritionist's logo + display name from sub-project A's Configurações), generated server-side and downloaded from the plan page.
**Builds on:** the meal-plan aggregate after sub-project C (`MealPlan → Meal → MealOption → MealItem` + the day targets on `MealPlan`), `MealPlansService.getPlan` (scoped read with `FULL_TREE`), the `MealPlansController` (`@Get(':id')` already `@Roles(NUTRITIONIST, EMPLOYEE)`), `NutritionistProfile.displayName`/`logoUrl` (A), `resolveScopeNutritionistId`, and the web `MealPlanEditor` (the plan view) + the `browserToken`/`apiFetch` plumbing. Same branch `feat/meal-plans-ui`.

---

## 1. Goal

Anyone who can view a plan (the owning nutritionist or their employees) can export it as a branded PDF. Done when: a "Exportar PDF" button on the plan page downloads a PDF whose header shows the nutritionist's logo + display name, followed by the plan title/objective/date, the daily targets, and every meal with its options (each option an item table with its own subtotal); the endpoint is scoped to the plan's owner (404 otherwise); a missing logo still produces a valid PDF; the button is hidden while creating a new (unsaved) plan.

## 2. Context

- A meal plan is rendered only by the `MealPlanEditor` (editable for nutritionists, read-only `fieldset disabled` for employees). The plan-detail route passes `canEdit` and renders the editor with `planId`.
- `MealPlansService.getPlan(ctx, id)` returns the full ordered tree (`meals → options → items`) + the `MealPlan` targets; it is scoped by `resolveScopeNutritionistId(ctx)` (nutritionist's own id, or an employee's employer id) and 404s for a non-owned plan. `MealPlansController` exposes `@Get(':id')` to `NUTRITIONIST` + `EMPLOYEE`.
- `NutritionistProfile` has `displayName` and `logoUrl` (a public Supabase Storage URL) from sub-project A. The settings endpoint is nutritionist-only — but the PDF resolves branding server-side, so employees never call it.
- No PDF library is installed. The web app talks to the API via `apiFetch`/`browserApiFetch` (JSON) with a Supabase bearer token from `browserToken()`.

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Where generated | **Server-side**, a NestJS endpoint (reusable by the patient app later). |
| Library | **pdfmake** (declarative, native tables, bundled Roboto fonts → pt-BR accents, no headless browser). |
| Who can export | **Anyone who can view the plan** (nutritionist + employee). The server resolves the logo/name from the plan's owning nutritionist (`resolveScopeNutritionistId`), so employees export with the employer's brand and never touch the settings endpoint. |
| Branding source | `NutritionistProfile.displayName` + `logoUrl` (A). Missing logo or fetch failure → PDF without the logo (no error). |
| Content | All meals, all options (each with its item table + subtotal), the daily targets, the meal instructions — mirrors the editor. |
| Trigger | "Exportar PDF" button on the plan view (the editor), shown only for an existing plan (`!isCreate`), for both roles. |

## 4. Backend — endpoint & service

- **`MealPlansController`** gains `@Get(':id/pdf')` `@Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)` → `pdf(ctx, id)`: calls `MealPlanPdfService.generate(ctx, id)` and returns a `StreamableFile(buffer, { type: 'application/pdf', disposition: 'attachment; filename="plano-alimentar.pdf"' })`. (`:id/pdf` is a distinct path from `:id`, so no routing conflict.)
- **`MealPlanPdfService`** (new, in the meal-plans module) `generate(ctx, id): Promise<Buffer>`:
  1. `const plan = await this.mealPlans.getPlan(ctx, id)` — reuses the scoped read (404 propagates for a non-owned/missing plan, before any work).
  2. Resolve branding: `const nutritionistId = resolveScopeNutritionistId(ctx)`; `const branding = await this.prisma.nutritionistProfile.findUnique({ where: { id: nutritionistId }, select: { displayName: true, logoUrl: true } })`.
  3. Logo: if `branding?.logoUrl`, `fetch(logoUrl)` → `arrayBuffer` → base64 data URL, inside `try/catch` (any failure → `logo = null`, PDF still renders).
  4. `const docDefinition = buildMealPlanDocDefinition(plan, { displayName: branding?.displayName ?? null, logoDataUrl })`.
  5. Render with a module-level `PdfPrinter` (Roboto fonts) → collect the PDF stream into a `Buffer` and resolve it.
- **`buildMealPlanDocDefinition(plan, branding)`** (new pure module, e.g. `meal-plans/pdf/meal-plan-doc.ts`): returns the pdfmake `TDocumentDefinitions`. No I/O — unit-testable. It assembles: header (logo image node when `branding.logoDataUrl`, else omitted; `displayName` text), title/objective/date, a targets row (omitted when all four targets are null), and for each meal a heading + instructions + per-option sub-heading + an items table + a subtotal row.

## 5. Backend — pdfmake setup

Add `pdfmake` (dependency) + `@types/pdfmake` (dev). Server usage instantiates `PdfPrinter` with the Roboto fonts bundled in pdfmake (so pt-BR accents render without extra font files), and `printer.createPdfKitDocument(docDefinition)` is piped into a buffer. The printer/font wiring lives in `MealPlanPdfService` (or a tiny `pdf-printer.ts` helper); `buildMealPlanDocDefinition` stays font-agnostic (it only sets styles/`defaultStyle`).

## 6. Web — download

- **`lib/api/browser.ts`** gains `browserApiDownload(path): Promise<Blob>` — uses `browserToken()` + a raw `fetch` against the same API base URL `apiFetch` uses, with `Authorization: Bearer <token>`, `Accept: application/pdf`; throws (pt-BR) on a non-OK response; returns `response.blob()`.
- **`lib/api/meal-plans.ts`** gains `downloadMealPlanPdf(id: string): Promise<void>` — `await browserApiDownload('/meal-plans/${id}/pdf')`, then create an object URL, click a temporary `<a download="plano-alimentar.pdf">`, and revoke the URL.
- **`MealPlanEditor`**: an "Exportar PDF" button in the header area (next to "Voltar ao paciente"), rendered only when `!isCreate`, for both roles (NOT behind `canEdit`). Clicking sets a local `exporting` state (button shows "Exportando…", disabled), calls `downloadMealPlanPdf(planId)`, and toasts a pt-BR error on failure. (No React Query mutation needed — it's a one-shot download, not cached state.)

## 7. Permissions / errors / states

The endpoint inherits the plan's read scope (`getPlan` → 404 for a non-owned plan); branding is the plan's nutritionist, so an employee gets the employer's brand with no access to the settings endpoint. A non-existent/forbidden plan → 404 (no PDF). A missing/broken logo → PDF without the logo. The web button is hidden in create mode (no plan id) and disabled while exporting; download failures toast in pt-BR.

## 8. Testing

- **API (Jest):** `buildMealPlanDocDefinition` (pure) — the doc contains the `displayName`, the plan title, every meal name, each option label, each item's food name, and the targets row; it includes an image node when `logoDataUrl` is set and omits it when null; it tolerates a meal with an empty option / an option with no items; the targets row is omitted when all four targets are null. `MealPlanPdfService.generate` — mocks `MealPlansService.getPlan` + `prisma.nutritionistProfile.findUnique` + the logo `fetch` + the printer, asserts it returns a `Buffer` and that a `getPlan` 404 propagates (and no printer call happens). Controller — `pdf` returns a `StreamableFile` with `application/pdf` + an attachment disposition.
- **Web (Vitest + RTL):** `downloadMealPlanPdf` — calls `browserApiDownload('/meal-plans/<id>/pdf')` and triggers a blob download (mock `browserApiDownload`/`URL.createObjectURL`/anchor click); `browserApiDownload` attaches the bearer token and returns the blob (mock `browserToken` + `fetch`). `MealPlanEditor` — shows "Exportar PDF" when `planId` is present (for both `canEdit` true and false) and hides it in create mode; clicking calls the download.

## 9. Out of scope (this slice)

A patient-app (patient-scoped) PDF endpoint; customizing the PDF template/colors/fonts; multiple languages; emailing or storing the PDF; a print-stylesheet web view; pagination/branding beyond the logo + display name.
