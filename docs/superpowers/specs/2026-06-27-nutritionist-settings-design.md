# Nutritionist Settings (Configurações) — Design

**Date:** 2026-06-27
**Status:** Approved (pending implementation plan)
**Scope:** Sub-project **A** of a 4-part batch (A Settings → B AI instructions → C meal options → D PDF). A new nutritionist-only **Configurações** page that persists and exposes meal-plan-related settings: a display name (e.g. "Dra. Daniela Almeida"), an uploaded **logo**, and a **default AI instructions** text. Plus the light/dark theme toggle. This slice only **stores and exposes** these — consuming them lives in later slices (B uses the default instructions in generation; D uses the name/logo in the PDF).
**Builds on:** the existing auth/role plumbing (`@Roles`, `resolveScopeNutritionistId`, `getCurrentUser`/`canManagePatients`, `Unauthorized`), the `SupabaseAdminService` (service-role client, which exposes `.storage`), `@nestjs/platform-express` (`FileInterceptor` for multipart), `next-themes`, and the patients UI patterns (React Query + `browserApiFetch` + zod). Same branch `feat/meal-plans-ui` (per the user's choice — all four sub-projects ship there).

---

## 1. Goal

A nutritionist can open **Configurações** and set the branding + AI defaults used by their meal plans: a display name, a logo image, and a default AI-instructions text; and toggle the theme. Done when: the sidebar shows a nutritionist-only "Configurações" item; the page (sectioned) lets a nutritionist edit the display name and default AI instructions (saved) and upload/replace/remove a logo (stored in Supabase Storage, URL persisted); an employee/patient cannot see the nav item or reach the page; and the theme toggle is available on the page. Employees and patients are blocked at the API too.

## 2. Context

- `NutritionistProfile` currently has only `crn` + `referralCode`. There is **no** settings endpoint and **no** Supabase Storage usage yet.
- `SupabaseAdminService` wraps a service-role `SupabaseClient`; its `.storage` API is available for server-side uploads. `@nestjs/platform-express` is installed, so Nest `FileInterceptor`/`ParseFilePipe` are available.
- The theme toggle (`components/app/theme-toggle.tsx`) lives in the sidebar footer (`next-themes`). The sidebar nav (`nav-items.ts`) gates items via `canAccess?: (role) => boolean`.

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Logo storage | **Supabase Storage via the API** (service-role upload), URL persisted on `NutritionistProfile`. Bucket `nutritionist-logos`, **public read**, created on-demand if missing. |
| Settings persistence | New nullable fields on `NutritionistProfile`: `displayName`, `logoUrl`, `mealPlanAiInstructions`. Additive migration (safe on the shared dev DB). |
| Endpoints | `GET`/`PATCH /v1/me/nutritionist-settings`; `POST`/`DELETE /v1/me/nutritionist-settings/logo`. All `@Roles(NUTRITIONIST)`, scoped to the caller's own profile. |
| Page layout | `/configuracoes`, **stacked sections** (cards) — not tabs (only two sections now): "Plano alimentar" and "Aparência". |
| Theme toggle | **Keep the sidebar toggle AND add one** in the "Aparência" section (both via `next-themes`, in sync). |
| Permissions | Nutritionist-only: API `@Roles` + server route guard (`Unauthorized` otherwise) + nav `canAccess`. |
| This slice's boundary | Only **persist/expose** name, logo, default instructions. PDF use (D) and generation use (B) are out of scope here. |

## 4. Backend — data model

`apps/api/prisma/schema.prisma`, `NutritionistProfile` gains (all nullable, additive):
- `displayName String?` — shown on the PDF later.
- `logoUrl String?` — public Storage URL.
- `mealPlanAiInstructions String?` — default instructions applied to all of this nutritionist's plan generations (consumed in slice B).

Run an additive `prisma migrate` (no data loss; the shared dev DB stays compatible). Regenerate the client.

## 5. Backend — Storage helper

`SupabaseAdminService` gains:
- `uploadPublicObject(bucket: string, path: string, body: Buffer, contentType: string): Promise<string>` — ensures the bucket exists (`getBucket`; if missing, `createBucket(bucket, { public: true })`), `upload(path, body, { contentType, upsert: true })`, returns `getPublicUrl(path).data.publicUrl`. Transport/storage failures → `BadGatewayException` (mirrors the invite/delete error mapping; never logs PII).
- `removeObject(bucket: string, path: string): Promise<void>` — best-effort `remove([path])`; a failure is logged, not thrown (the DB `logoUrl` clear is the source of truth).

## 6. Backend — settings module (`apps/api/src/nutritionist-settings`)

A new module (controller + service), `@Controller({ path: 'me/nutritionist-settings', version: '1' })`, `@Roles(UserRole.NUTRITIONIST)`. All operations target `resolveScopeNutritionistId(ctx)` (the caller's own `NutritionistProfile.id`).

- `GET /v1/me/nutritionist-settings` → `getSettings(ctx)`: `findUnique` the profile, return `{ displayName, logoUrl, mealPlanAiInstructions }`.
- `PATCH /v1/me/nutritionist-settings` → `updateSettings(ctx, dto)`: `UpdateNutritionistSettingsDto { displayName?: string (≤120), mealPlanAiInstructions?: string (≤4000) }`; `update` those fields; return the settings.
- `POST /v1/me/nutritionist-settings/logo` → `@UseInterceptors(FileInterceptor('file'))` + a `ParseFilePipe` (`FileTypeValidator` `image/png|jpeg|webp`, `MaxFileSizeValidator` 2 MB); `uploadLogo(ctx, file)`: derive ext from mimetype, `uploadPublicObject('nutritionist-logos', \`${nutritionistId}.${ext}\`, file.buffer, file.mimetype)`, persist `logoUrl`, return settings. (A new upload overwrites via `upsert`; switching extension leaves at most one stale object — acceptable, or the service may remove the prior path.)
- `DELETE /v1/me/nutritionist-settings/logo` → `removeLogo(ctx)`: clear `logoUrl` (and best-effort `removeObject`), return settings (`logoUrl: null`).

Employees/patients are blocked by `@Roles(NUTRITIONIST)`.

## 7. shared-types (`packages/shared-types/src/v1`)

New `nutritionist-settings.ts`:
- `NutritionistSettings { displayName: string | null; logoUrl: string | null; mealPlanAiInstructions: string | null }`.
- `UpdateNutritionistSettingsRequest { displayName?: string; mealPlanAiInstructions?: string }`.
Export from `index.ts`.

## 8. Web — data layer

- `lib/api/settings.ts`: `getNutritionistSettings(): Promise<NutritionistSettings>` (GET); `updateNutritionistSettings(body): Promise<NutritionistSettings>` (PATCH); `uploadLogo(file: File): Promise<NutritionistSettings>` (POST multipart — a `FormData` with `file`); `deleteLogo(): Promise<NutritionistSettings>` (DELETE). The multipart upload uses the session token but **not** the JSON content-type, so it needs a small variant of `browserApiFetch` (or a dedicated `browserApiUpload` that sends `FormData` with the bearer token and no `content-type` header). Add that helper.
- `lib/queries/settings.ts`: `useNutritionistSettings()` (key `['nutritionist-settings']`); `useUpdateNutritionistSettings()`, `useUploadLogo()`, `useDeleteLogo()` — all invalidate `['nutritionist-settings']`.
- `lib/validation/settings.ts`: `settingsSchema` (`displayName` optional ≤120, `mealPlanAiInstructions` optional ≤4000), pt-BR messages.

## 9. Web — page & nav

- **Route** `apps/web/src/app/(app)/configuracoes/page.tsx` (server): `getCurrentUser` → if `!me || me.role !== NUTRITIONIST` render `<Unauthorized />`, else `<SettingsView />`. (Add a `canManageSettings(role)` predicate = `role === NUTRITIONIST` to `lib/auth/access.ts`, used by both the page guard and the nav.)
- **Nav** (`nav-items.ts`): add `{ label: 'Configurações', href: '/configuracoes', icon: Settings, canAccess: canManageSettings }` (lucide `Settings` icon).
- **`SettingsView`** (client): `useNutritionistSettings()` (loading/error states), stacked sections:
  - **Plano alimentar** (a `<Card>`/section): a react-hook-form for `displayName` + `mealPlanAiInstructions` (textarea) with a Save button (PATCH); and a **logo control** — preview of `logoUrl` (or a placeholder), "Enviar"/"Substituir" (file input → `useUploadLogo`) and "Remover" (`useDeleteLogo`), each with its own pending/disabled state and pt-BR error toasts (invalid type/size). The logo uploads immediately on file pick (separate from the name/instructions Save).
  - **Aparência** (a section): the existing `ThemeToggle` (or a settings-styled theme switch) for light/dark.
- The page is nutritionist-only end to end (guard + nav + API).

## 10. Error handling / states

Forms: inline zod messages (pt-BR). API errors via `err instanceof ApiError` → friendly pt-BR. Logo upload: client-side guard hints + server `ParseFilePipe` rejects (>2 MB / wrong type) surfaced as a pt-BR toast. Loading/error on the settings query; mutations disable while pending and invalidate `['nutritionist-settings']`.

## 11. Testing

- **API (Jest):** `getSettings`/`updateSettings` scoped to the caller's profile; `uploadLogo` validates type/size, calls the storage helper, persists `logoUrl`; `removeLogo` clears it. The Supabase storage client is **mocked** (no real network). `UpdateNutritionistSettingsDto` follows the repo's no-DTO-unit-test convention (validated by the global pipe).
- **Web (Vitest + RTL):** settings API funcs (paths/methods/body/FormData for the upload); `settingsSchema`; `SettingsView` (loading/error; Save calls update with the form values; the logo control shows preview + calls upload on file pick and delete on remove; both sections render; theme toggle present); the `/configuracoes` page guard renders `Unauthorized` for an employee.
- `canManageSettings` predicate test (true for NUTRITIONIST, false for EMPLOYEE/PATIENT).

## 12. Out of scope (this slice)

Embedding the logo/name in the PDF (slice D); feeding `mealPlanAiInstructions` into generation (slice B); other future settings sections; image cropping/resizing; multiple logos/themes; per-employee settings.
