# Patients UI — list + create/update — Design

**Date:** 2026-06-22
**Status:** Approved (pending implementation plan)
**Scope:** The first real module UI: patients **list**, **create** form, and **detail/edit** page, wired to the existing `/v1/patients` API. Includes the post-creation flow that offers (but defers) bioimpedância.
**Builds on:** the app shell + sidebar (`docs/superpowers/specs/2026-06-22-app-shell-sidebar-design.md`). Same stack: Next.js App Router + shadcn + Tailwind + the iNutri brand. New branch off `main`.

---

## 1. Goal

A nutritionist can see their patients, register a new one (which invites the patient by email), and view/edit a patient's profile. After creating a patient they land on the patient's page, which offers to continue to bioimpedância — deferred to the next slice (shown as "em breve").

Done when: `/patients` lists the nutritionist's patients (with loading/empty/error states); "Novo paciente" → `/patients/new` form creates + invites; on success → `/patients/[id]` with a success banner; the detail page shows the profile, allows editing (PATCH), and shows a bioimpedância placeholder.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Data layer | **React Query (client-side)**; token from the browser Supabase session |
| Forms placement | **Dedicated pages**: `/patients/new`, `/patients/[id]` |
| Search | **None** this slice (YAGNI) |
| Bioimpedância (`BodyAssessment`) | **Deferred** to the next slice; the post-create flow + a placeholder section exist now, shown as "em breve" |
| Testing | Vitest + Testing Library, mirroring existing web tests |

## 3. API contract (existing `/v1/patients`)

- `POST /v1/patients` (NUTRITIONIST) — body `CreatePatientRequest` (name + email required, clinical optional). **Invites** the patient via Supabase Admin (sends email, creates the auth identity + linked local record). Returns the created `PatientDetail`.
- `GET /v1/patients` (NUTRITIONIST, EMPLOYEE) — returns `PatientSummary[]` scoped to the nutritionist.
- `GET /v1/patients/:id` (NUTRITIONIST, EMPLOYEE) — returns `PatientDetail` (profile + `user` + latest assessment); `404` if not owned/missing.
- `PATCH /v1/patients/:id` (NUTRITIONIST) — body `UpdatePatientRequest` (clinical fields only); `404` if not owned.

**Enums** (mirror the API's Prisma enums):
- `Gender`: `MALE | FEMALE | OTHER | PREFER_NOT_TO_SAY`
- `PatientObjective`: `WEIGHT_LOSS | MUSCLE_GAIN | MAINTENANCE | RECOMPOSITION`
- `ActivityLevel`: `SEDENTARY | LIGHT | MODERATE | ACTIVE | VERY_ACTIVE`

**Clinical fields** (all optional): `birthDate` (date, not future), `gender`, `height` (cm, >0), `targetWeight` (kg, >0), `objective`, `activityLevel`, `restrictions`, `allergies`, `medicalConditions`, `notes` (strings ≤2000). `name`/`email` are create-only (set on the User; not editable via PATCH).

pt-BR enum labels: objectives → Perda de peso / Ganho de massa / Manutenção / Recomposição; activity → Sedentário / Leve / Moderado / Ativo / Muito ativo; gender → Masculino / Feminino / Outro / Prefiro não informar.

## 4. Routes & pages (under the `(app)` group → already auth-protected)

- `/patients` — list (replaces the current stub).
- `/patients/new` — create form.
- `/patients/[id]` — detail page: read-only header (name/email) + editable profile form (PATCH) + bioimpedância placeholder; shows a one-time success banner when `?created=1`.

## 5. Data layer

- **`@nutri-plus/shared-types` (new `v1/patient.ts`):** the three enums + `PatientSummary` (id, user {id,name,email}, the clinical fields, nutritionistId, createdAt) + `PatientDetail` (Summary + `assessments`: unknown[] for now, typed loosely until the assessment slice) + `CreatePatientRequest` + `UpdatePatientRequest`. Web imports these (the API may adopt them later; not required now).
- **`apps/web/src/lib/api/patients.ts`:** typed functions `listPatients()`, `getPatient(id)`, `createPatient(body)`, `updatePatient(id, body)`. Each obtains the access token from the browser Supabase client (`createClient().auth.getSession()`) via a small `browserToken()` helper, then calls the existing `apiFetch` with that token. Dates are serialized as ISO strings; `birthDate` is parsed back to a `Date` where the form needs it.
- **`apps/web/src/lib/queries/patients.ts`:** React Query hooks — `usePatients()`, `usePatient(id)`, `useCreatePatient()`, `useUpdatePatient(id)`. Mutations invalidate the `['patients']` query (and `['patient', id]`) on success.

## 6. Forms & validation

`react-hook-form` + `zod` (v3) via the shadcn `Form` primitives, on dedicated pages.

- **`createPatientSchema`:** `name` (min 2, max 200), `email` (valid, max 320), + the optional clinical fields (`birthDate` ≤ today; `height`/`targetWeight` positive; `gender`/`objective`/`activityLevel` enum; text fields ≤2000).
- **`updatePatientSchema`:** the clinical fields only (same rules).
- Field controls: text `Input` (name, email), number `Input` (height, targetWeight), native date `Input type=date` (birthDate), shadcn `Select` (gender, objective, activityLevel), shadcn `Textarea` (restrictions, allergies, medicalConditions, notes). Empty optional fields are omitted from the request (not sent as empty strings).
- Sections (per the approved mockup): **Dados do paciente** (name, email — create only; with the "convite por e-mail" note), **Pessoal** (birthDate, gender), **Medidas & objetivo** (height, targetWeight, objective, activityLevel), **Saúde** (restrictions, allergies, medicalConditions, notes). Footer: Cancelar + Criar paciente / Salvar alterações; submit shows a pending state.

## 7. List UI (`/patients`)

A shadcn `Table` in a card: columns **Paciente** (avatar initials + name), **E-mail**, **Objetivo** (`Badge`, pt-BR label), **Atividade** (pt-BR), **Desde** (createdAt, `dd/MM/yyyy`). The whole row links to `/patients/[id]`. Header: title + count + "Novo paciente" button (→ `/patients/new`). States: **loading** (skeleton rows), **empty** ("Nenhum paciente ainda" + create CTA), **error** (message + retry). Mobile: the table becomes stacked cards (one per patient).

## 8. Detail page (`/patients/[id]`)

- **Read-only header:** avatar + name + email + a "Paciente" tag (name/email aren't editable via the API).
- **Editable profile:** the clinical form (sections Pessoal / Medidas & objetivo / Saúde), prefilled from `getPatient`, saving via `updatePatient` (PATCH) with a success toast.
- **Bioimpedância section:** a placeholder ("Nenhuma avaliação ainda" + "em breve" / "Próxima fatia"); no live action this slice.
- **Post-create banner** (when `?created=1`): "Paciente criado e convidado por e-mail" with **"Prosseguir para bioimpedância"** (disabled, tagged *em breve*) and **"Deixar para depois"** (dismiss). When the assessment slice ships, the button + the section's CTA go live (POST `/v1/patients/:id/assessments`) and an assessment timeline appears here.
- `404` from `getPatient` → a "paciente não encontrado" state (not the global error screen).

## 9. shadcn components to add

`select`, `textarea`, `table`, `badge` (via the CLI; `skeleton` already exists from the sidebar). If any isn't in the configured style's registry, hand-author per the canonical shadcn source (as done for `form`).

## 10. Error handling

- Form validation: inline zod messages (pt-BR).
- API errors via `ApiError` → a `sonner` toast + inline message. Map the common create failure (email already registered/invited) to a friendly pt-BR message; other errors fall back to a generic message.
- Mutations disable the submit button while pending.

## 11. Testing (Vitest + Testing Library)

- `lib/api/patients` — each function builds the right path/method/body and attaches the bearer token (mock `fetch` + the browser token).
- `validation/patient` — `createPatientSchema` / `updatePatientSchema` accept/reject cases (required name/email, future birthDate, non-positive height, enum, max lengths).
- List — renders rows from mocked `usePatients` data; empty state; loading; error. (Mock the query hook.)
- Create form — validation blocks submit; valid submit calls `createPatient` with the mapped body and routes to `/patients/[id]?created=1`; maps a create error to a message.
- Edit form — prefilled from a mocked patient; submit calls `updatePatient` with changed fields.
- Detail page — shows profile + bioimpedância placeholder; with `?created=1` shows the banner; "Prosseguir para bioimpedância" is disabled (em breve); "Deixar para depois" dismisses the banner.

## 12. Out of scope (YAGNI / next slices)

`BodyAssessment` / bioimpedância **form + timeline** (next slice; the entry points exist here as "em breve"); patient search/filter/pagination; deleting/archiving patients; meal plans; editing the patient's name/email (not supported by the API). 
