# WhatsApp contact + patient meal diary — Design

**Date:** 2026-08-21
**Branch:** `feat/patient-contact-meal-diary` (off main)
**Status:** Approved design — ready for implementation plan

Improve the ongoing relationship between patient and nutritionist: a practice WhatsApp number the patient can open from the app, and a patient-authored meal diary the nutritionist reads on the web. Two parts, one spec, built **A → B**.

Recordatório 24h is unchanged (nutritionist-authored consult tool). This diary is a separate running log the patient writes.

---

## Decisions (from brainstorming)

- **WhatsApp** is one number on the nutritionist profile (Configurações → Aplicativo Paciente). It applies to every patient immediately. Empty/null hides the button. Validation is **format only** (digits, DDD, prepend `55`) — Meta does not offer a public “this number has WhatsApp” check; unofficial lookup APIs stay out of v1.
- Settings includes **Testar no WhatsApp**: opens `https://wa.me/<canonical>` in a new tab so the nutritionist can confirm the chat themselves.
- App button **Conversar com nutricionista** on **Evolução (home)** and on the **Config** “Meu nutricionista” card. Opens `https://wa.me/<digits>` with no prefilled text.
- New app tab **Diário** (5th tab: Evolução · Planos · Diário · Fora de casa · Config).
- A log is one eaten meal. From the plan: pick **meal + option** + optional note. Off-plan: required free text + optional note.
- Picker uses only the **latest visible** meal plan (`visibleToPatient: true`, newest `createdAt`). No visible plan → only free text (“Do meu plano” disabled).
- Date and time on each log, default **now**, backfill allowed.
- Patient may **edit and delete only in the first 24 hours after `createdAt`** (not `consumedAt`). After that, Edit/Delete still show; tapping explains why. Nutritionist is **read-only**.
- New patient-detail tab **Diário** (after Recordatório). Nutritionist and employee can view; nobody on web creates or edits logs.
- Snapshot foods at save time so later plan edits do not rewrite history.
- v1 out of scope: photos, nutritionist comments, push when the patient logs, in-app chat, per-patient WhatsApp, Recordatório changes, TACO picker in the app, calling WhatsApp/Meta to check that the number is registered.

---

## Goal

Done when: the nutritionist can save a WhatsApp number in Aplicativo Paciente and test it via **Testar no WhatsApp**; patients with that number see Conversar com nutricionista on Evolução and Config and land in a WhatsApp chat; patients can register, edit (24h), and delete (24h) meals from the Diário tab (plan option or free text); the nutritionist sees that history on the patient page, grouped by day.

---

## 1. Data model

Additive migration on the shared dev DB.

### `NutritionistProfile`

```prisma
whatsappNumber String?  // digits only, canonical with country code (e.g. 5511999998888)
```

### Enum + `MealLog`

```prisma
enum MealLogSource {
  PLAN
  FREE_TEXT
}

model MealLog {
  id             String        @id @default(uuid())
  patientId      String
  patient        PatientProfile @relation(fields: [patientId], references: [id], onDelete: Cascade)
  consumedAt     DateTime
  source         MealLogSource
  note           String?
  freeText       String?
  mealName       String?
  mealTimeLabel  String?
  optionLabel    String?
  itemsJson      Json?
  mealPlanId     String?
  mealPlan       MealPlan?     @relation(fields: [mealPlanId], references: [id], onDelete: SetNull)
  mealId         String?
  meal           Meal?         @relation(fields: [mealId], references: [id], onDelete: SetNull)
  mealOptionId   String?
  mealOption     MealOption?   @relation(fields: [mealOptionId], references: [id], onDelete: SetNull)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@index([patientId, consumedAt])
}
```

`PatientProfile.mealLogs MealLog[]`. `MealPlan` / `Meal` / `MealOption` gain the inverse `mealLogs MealLog[]` (optional FKs only).

`itemsJson` shape (PLAN only; `null` on FREE_TEXT):

```ts
{ foodName: string | null; quantity: string | null; calories: number | null; protein: number | null; carbs: number | null; fats: number | null; grams: number | null }[]
```

**24h window:** `editableUntil = createdAt + 24h` on the server clock (exact duration, not calendar days). Backfilling yesterday’s almoço stays editable for 24h from save time.

**Latest visible plan:** `mealPlan.findFirst({ where: { patientId, visibleToPatient: true }, orderBy: { createdAt: 'desc' } })`.

---

## 2. shared-types (`packages/shared-types/src/v1`)

- `nutritionist-settings.ts`: `whatsappNumber: string | null` on `NutritionistSettings`; optional on `UpdateNutritionistSettingsRequest`.
- `nutritionist-contact.ts`: `whatsappNumber: string | null` on `NutritionistContact`.
- New `meal-log.ts`:
  - `MealLogSource = 'PLAN' | 'FREE_TEXT'`
  - `MealLogItemSnapshot` (fields above)
  - `MealLog` — all persisted fields + `editableUntil: string` (ISO)
  - `CreateMealLogRequest` / `UpdateMealLogRequest`: `consumedAt: string`; `source`; `note?: string`; `freeText?: string`; `mealOptionId?: string`
  - Client never sends the snapshot; the server fills it.

Export from `v1/index.ts`. Rebuild `@nutri-plus/shared-types`.

---

## 3. API

### A. WhatsApp

- `GET`/`PATCH /v1/me/nutritionist-settings` (`@Roles(NUTRITIONIST)`): read/write `whatsappNumber`.
  - Normalize: strip to digits. Empty / null → store `null`.
  - 10 or 11 digits (DDD + number, as the placeholder shows) → prepend `55` and store.
  - Already starts with `55` and length 12–13 → store as-is.
  - Any other 12–15 digit string → store as-is (non-BR).
  - Else `400`.
  - `wa.me` always uses the stored canonical digits.
  - Shared canonicalize helper (same rules in API DTO/service and web form) so Testar and save cannot disagree.
- `GET /v1/me/nutritionist` (`@Roles(PATIENT)`): include `whatsappNumber` (null if unset or no nutritionist). Patients cannot write it.

### B. Meal logs — module `apps/api/src/meal-logs`

Patient controller `@Controller({ path: 'me/meal-logs', version: '1' })`, `@Roles(PATIENT)`:

| Verb | Path | Behavior |
|---|---|---|
| `POST` | `/` | Create |
| `GET` | `/` | Own logs |
| `PATCH` | `/:id` | Update if `now < createdAt + 24h` |
| `DELETE` | `/:id` | Delete if `now < createdAt + 24h` |

Nutritionist/employee: `GET /v1/patients/:id/meal-logs` (`@Roles(NUTRITIONIST, EMPLOYEE)`). Ownership via `resolveScopeNutritionistId`; unknown/foreign patient → **404**. Read-only (no POST/PATCH/DELETE on this path).

**List query:** optional `from` / `to` (ISO dates, inclusive, UTC day bounds). If both omitted, default **last 30 days** from `now()`. `all=true` disables the default (web “Tudo”). Order `consumedAt` desc. Each row is a full `MealLog` including snapshot + `editableUntil`.

**Create / update body**

- `consumedAt` ISO. Reject if more than 5 minutes in the future (`400`). Past is allowed.
- `note` optional, ≤500.
- `source = PLAN`: `mealOptionId` required. Load that option **on the patient’s latest visible plan** (option → meal → plan). If missing / not on that plan → `400`. Snapshot `mealName`, `mealTimeLabel`, `optionLabel`, `itemsJson` from current option items; persist the optional FKs. `freeText` must be null.
- `source = FREE_TEXT`: `freeText` required, ≤1000. Snapshot fields and FKs null.
- PATCH accepts the same shape (full replace of log content, including source) while the window is open. Re-snapshot when `source = PLAN`.

**Errors**

- After 24h: `403` with message `Só é possível editar ou apagar uma refeição nas primeiras 24 horas.`
- Other patient’s log / unknown id: `404` (no leak).
- Validation: `400`.

Picker: reuse `GET /v1/me/meal-plans` + `GET /v1/me/meal-plans/:id`. No new picker endpoint. App takes the latest summary, then the full tree.

**LGPD:** `onDelete: Cascade` from `PatientProfile` (account delete needs no extra `deleteMany`). `exportMyData` includes `mealLogs` (ordered by `consumedAt`).

---

## 4. Web

### Configurações → Aplicativo Paciente

Own block **above** the “defaults for new patients” copy/toggles (WhatsApp is not a per-new-patient default):

- Label **WhatsApp para pacientes**
- Input, placeholder `11999998888`
- Helper: *Com DDD. Os pacientes tocam em Conversar com nutricionista e abrem o WhatsApp neste número. Deixe vazio para esconder o botão.*
- **Testar no WhatsApp** (outline button next to the field): enabled when the current input canonicalizes to a valid number (same 10–11 → prepend `55` rule). Opens `https://wa.me/<canonical>` in a new tab (`target=_blank`, `rel=noopener`). Disabled when empty/invalid. Does not require a successful save first — they can try the number they just typed.
- Saves with the existing tab **Salvar** (same PATCH). Client: digits only; empty clears. Same canonicalize rule as the API (client may send DDD-only; server canonicalizes).

### Patient detail → tab **Diário**

After **Recordatório**. Visible to nutritionist and employee. Always read-only.

- Range control: **30 / 90 / Tudo** (maps to `from`/`to` or `all=true`). Default 30 days.
- Group by local calendar day of `consumedAt` (pt-BR). Each row: time; `mealName · optionLabel` or `freeText`; note; PLAN snapshot foods (`foodName` + `quantity`).
- Empty: *O paciente ainda não registrou refeições no aplicativo.*
- Loading / error + retry, same pattern as Recordatório.

`lib/api/meal-logs.ts` + `lib/queries/meal-logs.ts` (`['meal-logs', patientId, range]`). No comments, no link to the live plan editor.

Update `NutritionistSettings` fixtures with `whatsappNumber`.

---

## 5. Mobile

Tab bar (insert Diário after Planos):

| Tab | Icon |
|---|---|
| Evolução | `pulse` (unchanged) |
| Planos | `restaurant` (unchanged) |
| **Diário** | `journal-outline` |
| Fora de casa | `compass-outline` (unchanged) |
| Config | `settings-outline` (unchanged) |

Nested stack like Planos: `diario/_layout.tsx`, `diario/index.tsx` (list), `diario/nova.tsx` (create), `diario/[id].tsx` (edit). Child routes live in the stack, not as extra tabs.

### Conversar com nutricionista

Visible iff `useMyNutritionist().data?.whatsappNumber` is a non-empty digit string. `Linking.openURL('https://wa.me/' + digits)`. Failure → Alert *Não foi possível abrir o WhatsApp.*

- Evolução: card/button near the top (under BrandHeader / meta card).
- Config: button on the “Meu nutricionista” card.

### Diário list

`GET /me/meal-logs` (default last 30 days). Grouped by day. Row: time + title (`Almoço · Opção A` or free text) + note. Empty: *Nenhuma refeição registrada ainda.* Primary **Registrar refeição**. Loading / error + retry.

### Registrar / editar

1. Date + time (default now).
2. **Do meu plano** | **Outra refeição**.
3. Plano: latest visible plan’s meals (skip a meal that has zero options). Tap meal → options (label + foods). Optional note. No visible plan: disable **Do meu plano** with *Nenhum plano disponível. Descreva a refeição.*
4. Outra: required text + optional note.
5. Salvar → `POST` / `PATCH`.

If `now < editableUntil`: show Edit (same form) and Delete (confirm). If locked: still show both; tap → `Alert` with the 24h sentence. Do not hide the actions.

All copy pt-BR. Reuse `Screen`, `Button`, `TextField`.

---

## 6. Error handling / states

- Settings: inline zod; API 400 → toast *Não foi possível salvar.* Empty WhatsApp is valid.
- **Testar no WhatsApp:** no extra error path if the number has no WhatsApp account (WhatsApp’s own empty-chat / invalid screen). Button simply disabled when the field does not canonicalize.
- WhatsApp open (app): Alert on `Linking` failure.
- Create: app disables PLAN when there is no visible plan; API still 400 if `mealOptionId` is not on that plan.
- 24h: app uses `editableUntil`; API is source of truth (`403` + the same sentence).
- Mutations disable while pending. Lists: loading, empty, retry.

No new npm/Expo dependencies.

---

## 7. Testing

- **API (Jest):** settings GET/PATCH `whatsappNumber` (strip, empty→null, 11-digit DDD prepends `55`, 400 on bad length); `me/nutritionist` includes the canonical number; create PLAN snapshots from latest visible plan only (hidden / older plan option → 400); FREE_TEXT; PATCH/DELETE ok inside 24h, 403 after (freeze `createdAt`); 404 foreign ids; nutritionist list scoped; default 30-day list window; `all=true` returns older rows. No DTO unit tests (global ValidationPipe).
- **Web (Vitest):** Aplicativo tab renders the WhatsApp field and includes it in save; **Testar no WhatsApp** disabled when empty, `href`/`wa.me` uses canonical digits (11-digit DDD prepends `55`) when valid; Diário tab on patient detail; read-only grouped list; empty copy; range control. Update settings/contact fixtures.
- **Mobile (Jest):** button hidden without a number; present on Evolução and Config when set; `wa.me` URL uses digits; Diário tab in the shell; list grouping; register PLAN vs FREE_TEXT; locked log Alert; no visible plan disables PLAN. `tsc` clean.
- **shared-types:** `pnpm --filter @nutri-plus/shared-types build` clean.

---

## File map

- `apps/api/prisma/schema.prisma` + migration `add_whatsapp_and_meal_logs`
- `packages/shared-types/src/v1/{nutritionist-settings,nutritionist-contact,meal-log,index}.ts`
- `apps/api/src/nutritionist-settings/**` (DTO + service mapping)
- `apps/api/src/patients/patients.service.ts` (`getMyNutritionist`, `exportMyData`)
- `apps/api/src/meal-logs/**` (module, patient controller, nutritionist list controller, service, DTOs, specs)
- `apps/api/src/app.module.ts`
- `apps/web/src/lib/{api,queries,validation}/` settings + meal-logs
- `apps/web/src/components/settings/settings-view.tsx` (+ tests)
- `apps/web/src/components/patients/{patient-detail,meal-diary-section}.tsx` (+ tests)
- `apps/mobile/app/(app)/_layout.tsx` + `diario/**`
- `apps/mobile/app/(app)/{index,configuracoes/index}.tsx` (WhatsApp button)
- `apps/mobile/lib/queries/{nutritionist,meal-logs}.ts` (+ tests)
- Fixtures alongside each surface

---

## Constraints

- Additive migration. shared-types rebuilt. **No new dependencies.** pt-BR UI.
- Match file quote styles (API single quotes; web per file). API + mobile tests Jest / web Vitest.
- Do **not** push/PR without asking. Stay on `feat/patient-contact-meal-diary`.
- Verify by area: shared-types build; API test+tsc; web test+tsc; mobile test+tsc.
