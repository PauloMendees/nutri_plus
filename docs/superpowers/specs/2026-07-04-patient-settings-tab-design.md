# Patient Settings Tab (Configurações) — Design

**Date:** 2026-07-04
**Status:** Approved (design), pending spec review

## Goal

Build out the mobile **Configurações** tab so a patient can: change their access
password, switch the app theme (light / dark / system), view basic data about
their nutritionist, log out (already exists), and permanently delete their
account.

## Overview

This is a mostly mobile feature (Expo) with two small additions to the API (a
patient-facing "my nutritionist" read + a "delete my account" endpoint) and one
`shared-types` interface. The two pieces with real depth are the **theme
system** (the app's color tokens are currently hardcoded dark and must become
scheme-reactive) and **delete account** (an ordered destructive teardown across
`onDelete: Restrict` relations, plus removing the Supabase auth user so the
email is freed).

No database migration is required.

## Out of scope (explicitly)

- **"Desvincular nutricionista"** — dropped. Only "Apagar conta" exists.
- **Web-side re-link by email** — not built here. After "Apagar conta" fully
  removes the Supabase auth user, the email is free and a nutritionist re-invites
  it through the existing "adicionar paciente" flow (a brand-new account). No
  changes to the web patient-creation flow.

---

## 1. Screen structure

`app/(app)/configuracoes.tsx` (currently a flat file) becomes a **stack**,
mirroring the existing `planos/` pattern, so "Alterar senha" gets its own route:

- `app/(app)/configuracoes/_layout.tsx` — `Stack` (headerless or minimal header).
- `app/(app)/configuracoes/index.tsx` — the settings list.
- `app/(app)/configuracoes/senha.tsx` — the change-password form.

The `Tabs.Screen` name in `app/(app)/_layout.tsx` **stays `configuracoes`**. Because
`typedRoutes` is ON, regenerate router types (`npx expo customize tsconfig.json`)
before `tsc` on any task that adds these routes. The old flat file is removed via
`git rm`/`git mv`.

`index.tsx` is a scrollable list built from the existing `Screen`, `Button`, and
`Text`/`View` primitives (no new UI primitives). Sections, top to bottom:

1. **Meu nutricionista** — a card: avatar (`logoUrl`), name (`displayName`
   falling back to `name`), email, and CRN.
2. **Conta** — "Alterar senha" row → navigates to `senha`.
3. **Aparência** — theme selector: Claro / Escuro / Sistema.
4. **Sair** — existing `signOut` from `useSession()`.
5. **Apagar minha conta** — destructive, at the bottom, styled with `destructive`.

---

## 2. Theme system (light / dark / system)

### Problem

The app's semantic color tokens (`background`, `foreground`, `card`, `border`,
`input`, `primary`, `secondary`, `muted`, `accent`, `destructive`) are
**hardcoded dark hex** in `apps/mobile/tailwind.config.js`. Flipping the color
scheme does nothing to them today. The provider plumbing already supports
`'light' | 'dark' | 'system'` (`GluestackUIProvider` calls NativeWind's
`setColorScheme(mode)` and applies `config[colorScheme]` as a `vars()` style),
but it is hardcoded `mode="dark"` in `app/_layout.tsx`, and the semantic tokens
don't reference any variables.

### Approach (chosen)

Make the semantic tokens **scheme-reactive via CSS variables**, the idiomatic
NativeWind v4 approach. (The alternative — rewriting every `className` with
`dark:` variants — is large, error-prone churn and is rejected.)

1. **`components/ui/gluestack-ui-provider/config.ts`** — add the semantic-token
   variables to **both** the `light` and `dark` `vars({...})` blocks. Use plain
   names (no `--color-` prefix, to avoid colliding with gluestack's own
   `--color-*` scale): `--background`, `--foreground`, `--card`, `--border`,
   `--input`, `--primary`, `--primary-foreground`, `--secondary`,
   `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`,
   `--accent-foreground`, `--destructive`, `--destructive-foreground`. Values are
   space-separated RGB triplets.
2. **`tailwind.config.js`** — change those semantic keys from fixed hex to
   `rgb(var(--token) / <alpha-value>)`. The gluestack numeric scales
   (`tertiary`/`error`/`success`/`warning`/`info`/`typography`/`outline`/`indicator`)
   already use `--color-*` vars and are left unchanged.

### Palette values

**Dark** = exactly today's values (no visual change in dark mode).

| Token                  | Dark (hex → rgb)          | Light (hex → rgb)         |
|------------------------|---------------------------|---------------------------|
| `--background`         | `#0d1411` → `13 20 17`    | `#f6faf8` → `246 250 248` |
| `--foreground`         | `#e7ece9` → `231 236 233` | `#0d1411` → `13 20 17`    |
| `--card`               | `#141d19` → `20 29 25`    | `#ffffff` → `255 255 255` |
| `--border`             | `#243029` → `36 48 41`    | `#dbe5e0` → `219 229 224` |
| `--input`              | `#2c3a33` → `44 58 51`    | `#eef3f0` → `238 243 240` |
| `--primary`            | `#14bfa6` → `20 191 166`  | `#0f9e88` → `15 158 136`  |
| `--primary-foreground` | `#04241b` → `4 36 27`     | `#ffffff` → `255 255 255` |
| `--secondary`          | `#1a2520` → `26 37 32`    | `#e6f4ef` → `230 244 239` |
| `--secondary-foreground`| `#a7d8c9` → `167 216 201`| `#0f5f4e` → `15 95 78`    |
| `--muted`              | `#161f1b` → `22 31 27`    | `#eef3f0` → `238 243 240` |
| `--muted-foreground`   | `#8a9a92` → `138 154 146` | `#5c6b64` → `92 107 100`  |
| `--accent`             | `#1a2520` → `26 37 32`    | `#e6f4ef` → `230 244 239` |
| `--accent-foreground`  | `#a7d8c9` → `167 216 201` | `#0f5f4e` → `15 95 78`    |
| `--destructive`        | `#e5484d` → `229 72 77`   | `#dc2626` → `220 38 38`   |
| `--destructive-foreground`| `#ffffff` → `255 255 255`| `#ffffff` → `255 255 255`|

### Persistence + wiring

- **`lib/theme.ts`** — a `ThemeProvider` + `useTheme()` hook exposing
  `{ mode: ModeType, setMode(mode) }`. On mount it reads the stored preference
  from `SecureStore` (key e.g. `theme-preference`), defaulting to `'system'`.
  `setMode` persists to `SecureStore` and updates state. To avoid a theme flash,
  the provider renders nothing (or the existing splash) until the stored value
  has loaded.
- **`app/_layout.tsx`** — wrap the tree in `ThemeProvider`; `GluestackUIProvider`
  receives `mode` from `useTheme()` instead of the hardcoded `"dark"`. `'system'`
  makes NativeWind follow the OS scheme.
- **Theme selector** (in `configuracoes/index.tsx`) — three options that call
  `setMode('light' | 'dark' | 'system')`, with the active option visually marked.
- **Tab bar** — `app/(app)/_layout.tsx` currently hardcodes dark hex for
  `tabBarActiveTintColor` / `tabBarInactiveTintColor` / `tabBarStyle`. Make these
  scheme-aware by reading the resolved scheme (NativeWind `useColorScheme`) and
  selecting the light/dark values from the palette above.

---

## 3. Alterar senha (change password)

Mobile-only; uses Supabase directly (no API endpoint). Requires the current
password (re-authentication), per decision.

- **`lib/validation/auth.ts`** — add `changePasswordSchema`:
  `currentPassword: z.string().min(1, 'Informe sua senha atual.')`,
  `password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.')`,
  `confirmPassword: z.string()`, with a `.refine(v => v.password === v.confirmPassword, { message: 'As senhas não coincidem.', path: ['confirmPassword'] })`.
- **`configuracoes/senha.tsx`** — three secure `TextField`s (senha atual / nova
  senha / confirmar). On submit:
  1. `supabase.auth.signInWithPassword({ email, password: currentPassword })` to
     verify the current password. On error → field error "Senha atual incorreta.".
  2. `supabase.auth.updateUser({ password })`.
  3. Success → confirmation message + `router.back()`.
- The existing "Esqueci minha senha" recovery flow is unchanged and remains the
  path for users who don't know their current password.

---

## 4. Ver dados do nutricionista

- **API** — new `GET /v1/me/nutritionist`, `@Roles(PATIENT)`, on a new
  `MeController` (`@Controller({ path: 'me', version: '1' })`) registered in the
  patients module. It delegates to `PatientsService.getMyNutritionist(ctx)`:
  resolve `ctx.user.patientProfile.nutritionistId`; if null, return `null`;
  otherwise load `NutritionistProfile` (include `user`) and map to
  `{ name, displayName, email, crn, logoUrl }`.
- **`packages/shared-types/src/v1`** — add a `NutritionistContact` interface
  (`name: string; displayName: string | null; email: string; crn: string | null;
  logoUrl: string | null`), export from `v1/index.ts` (root re-exports v1). Build
  with `pnpm --filter @nutri-plus/shared-types build`.
- **Mobile** — `lib/queries/nutritionist.ts` (`useMyNutritionist()` → `apiFetch`
  of `/me/nutritionist`) + the "Meu nutricionista" card in `index.tsx` with
  loading / empty (no nutritionist) / loaded states.

---

## 5. Apagar minha conta (hard delete)

- **API** — new `DELETE /v1/me`, `@Roles(PATIENT)`, on the same `MeController`,
  delegating to `PatientsService.deleteMyAccount(ctx)` (the service already
  injects `prisma` and `supabaseAdmin`):
  1. Resolve the patient's `PatientProfile` + owning `User` (need `user.id` and
     `user.authProviderId`).
  2. Run a single `$transaction` that deletes in **`Restrict`-safe order**:
     `outsideHomeRequest` → `aiInteraction` → `appointment` → `bodyAssessment` →
     `mealPlan` (its `meal`/`mealOption`/`mealItem` children cascade) →
     `patientProfile` → `user`. Atomic — all or nothing.
  3. After the transaction commits: `supabaseAdmin.deleteUser(authProviderId)`.
     This frees the email so a nutritionist can invite it fresh later. If this
     external call fails, log the `authProviderId` (via the standard logger) for
     manual cleanup; the local data is already gone and the rest stays
     consistent. (Local teardown is atomic and comes first, mirroring the inverse
     of `createPatient`'s Supabase-then-local pattern.)
- **Mobile** — the red "Apagar minha conta" row opens a native `Alert.alert`:
  - Title: "Apagar conta"
  - Message: "Isso apagará permanentemente sua conta e todos os seus dados —
    avaliações, planos e histórico. Esta ação não pode ser desfeita."
  - Buttons: "Cancelar" (cancel) and "Apagar" (`style: 'destructive'`).
  - On confirm → `apiFetch('/me', { method: 'DELETE' })` → on success call
    `signOut()` (clears the session) → the auth guard returns the user to login.
  - On error → an inline error message; the account is untouched.

---

## 6. Testing

- **API (jest, `pnpm --filter @nutri-plus/api test`):**
  - `getMyNutritionist`: returns the mapped fields for a linked patient; returns
    `null` when `nutritionistId` is null; is patient-scoped.
  - `deleteMyAccount`: deletes children in the correct order, then profile, then
    user; calls `supabaseAdmin.deleteUser(authProviderId)`; is scoped to the
    calling patient only.
- **Mobile (jest, `pnpm --filter @nutri-plus/mobile test`):** hooks tested via a
  `Probe` component + `QueryClient { retry:false, gcTime:0, mutations:{retry:false, gcTime:0} }` (never `renderHook`):
  - Theme: `setMode` persists to `SecureStore` and the selector reflects the
    active mode.
  - Change password: validation errors; wrong current password shows "Senha
    atual incorreta."; success calls `updateUser` (Supabase mocked).
  - Nutritionist card: loading / empty / loaded states.
  - Delete: confirming the alert calls `DELETE /me` then `signOut` (both mocked);
    canceling does nothing.
- **Type check:** `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` (after
  `npx expo customize tsconfig.json` regenerates router types for the new
  `configuracoes/` routes).

---

## 7. Global constraints (verbatim)

- SINGLE quotes in new files; pt-BR user copy.
- Relative imports in mobile matching existing screens; reuse `Screen` /
  `TextField` / `Button` — no new mobile UI primitives.
- Expo Go must keep working: only Expo-SDK modules (`expo-secure-store` is
  already used; `@expo/vector-icons` already a dep) — no dev-build-only native
  modules.
- Do NOT reintroduce `node-linker=hoisted`; never commit `.env` or `.expo/`.
- The Supabase anon key stays client-only; no migrations needed (this feature
  adds none); migrations, if ever added, are additive on the shared dev DB.
- `typedRoutes` regen (`npx expo customize tsconfig.json`) before mobile `tsc`
  on any task adding routes; never name a test file `_layout*`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do not push/PR unless asked.
