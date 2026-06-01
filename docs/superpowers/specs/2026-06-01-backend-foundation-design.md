# Backend Foundation — Design Spec

**Date:** 2026-06-01
**Sub-project:** 1 of N (Backend Foundation)
**Status:** Approved for planning

## Context

Nutri Plus is a nutrition SaaS for nutritionists (`NUTRITIONIST`) and patients
(`PATIENT`), with AI that *suggests, adapts and explains* — never calculates.
All critical calculations (macros, BMI, TDEE) stay in the backend.

The full product is described across `docs/01`–`docs/09` as a sequential roadmap.
That roadmap is a natural decomposition into independent sub-projects, each of
which gets its own spec → plan → implementation cycle. **This spec covers only
Sub-project 1: the Backend Foundation** — the "walking skeleton" every feature
builds on.

### Fixed decisions (from brainstorming)

- **Monorepo tooling:** pnpm workspaces + Turborepo.
- **Front/mobile:** folder structure only; no scaffold yet (`apps/web`,
  `apps/mobile` are placeholders).
- **Supabase:** cloud project, used for **Auth only**. The backend validates the
  Supabase JWT via `SUPABASE_JWT_SECRET` and does not couple to Supabase's DB.
- **App database:** local Postgres in Docker, schema managed by Prisma. The
  `sync-user` flow copies the authenticated user into the local DB precisely to
  keep the backend decoupled from Supabase's database.
- **API versioning:** URI versioning, `v1` from the start.

## Scope

In scope for this sub-project:

- Monorepo structure (pnpm + Turborepo) with placeholders for web/mobile.
- NestJS app scaffold (`apps/api`) with module boundaries.
- Prisma + Postgres (Docker) setup.
- Config/env validation.
- Supabase JWT validation + guards + role-based authorization.
- User synchronization (`POST /v1/auth/sync-user`, `GET /v1/auth/me`).
- Base data models: `User`, `NutritionistProfile`, `PatientProfile`.
- `referralCode` generation for nutritionists.
- API versioning (`v1`).
- Error handling, global validation, and a test suite (TDD).

## Monorepo Layout

```
nutri_plus/
├── apps/
│   ├── api/          # NestJS — the only app implemented now
│   ├── web/          # placeholder (.gitkeep + README)
│   └── mobile/       # placeholder (.gitkeep + README)
├── packages/
│   └── shared-types/ # shared contracts (DTOs, enums), versioned (v1/) — pure TS
├── package.json      # workspaces + root scripts
├── pnpm-workspace.yaml
├── turbo.json
└── docker-compose.yml # local Postgres
```

`packages/shared-types` is created now because web and mobile will consume the
API contracts. For this sub-project it contains only the enums/DTOs the API
exposes, namespaced under `v1/`.

## NestJS App Structure (`apps/api`)

```
src/
├── main.ts            # bootstrap + enableVersioning(URI, default '1')
├── app.module.ts
├── config/            # env schema validation; app does not boot if env invalid
├── prisma/            # PrismaModule + PrismaService
├── auth/
│   ├── guards/        # SupabaseJwtGuard, RolesGuard
│   ├── decorators/    # @CurrentUser, @Roles, @Public
│   ├── strategies/    # Supabase JWT validation
│   ├── auth.controller.ts   # POST /v1/auth/sync-user, GET /v1/auth/me
│   └── auth.service.ts
├── users/             # User + profiles (repository/service)
└── common/            # exception filter, interceptors, global pipes
```

**Boundary rules:**

- Controllers never touch Prisma directly — always through services.
- `auth` is the only module that decodes JWTs.
- Each unit has one clear purpose and a well-defined interface.

## API Versioning

NestJS native URI versioning:

```ts
app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
```

All routes live under `/v1`. Controllers declare
`@Controller({ path: 'auth', version: '1' })`. Future breaking contract changes
become `version: '2'` without touching existing `v1` routes. `shared-types` is
organized by version (`v1/`) so front/mobile consume the correct namespace.

Endpoints:

- `POST /v1/auth/sync-user`
- `GET /v1/auth/me`

## Data Models (Prisma)

The foundation stays lean. Clinical fields (weight, height, objective,
restrictions) are deferred to the Patient/Meal Plan sub-projects. Only what
supports auth + the nutritionist↔patient link lives here.

```prisma
enum UserRole {
  NUTRITIONIST
  PATIENT
}

model User {
  id             String   @id @default(uuid())
  authProvider   String                    // "SUPABASE"
  authProviderId String                    // JWT sub
  email          String   @unique
  name           String
  role           UserRole
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  nutritionistProfile NutritionistProfile?
  patientProfile      PatientProfile?

  @@unique([authProvider, authProviderId])
}

model NutritionistProfile {
  id           String   @id @default(uuid())
  userId       String   @unique
  user         User     @relation(fields: [userId], references: [id])
  crn          String?                      // professional registration (optional)
  referralCode String   @unique             // generated: "NUTRI-XXXXX"
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  patients     PatientProfile[]
}

model PatientProfile {
  id             String   @id @default(uuid())
  userId         String   @unique
  user           User     @relation(fields: [userId], references: [id])
  nutritionistId String?
  nutritionist   NutritionistProfile? @relation(fields: [nutritionistId], references: [id])
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

### referralCode generation

- Generated in the backend when a `NutritionistProfile` is created.
- Format: `NUTRI-` + 5 alphanumeric chars (Crockford base32, no ambiguous
  characters).
- Retry on unique-constraint collision.

## Auth Flow and Guards

- **`SupabaseJwtGuard`** (global): reads `Authorization: Bearer <jwt>`, validates
  the signature with `SUPABASE_JWT_SECRET` (HS256), extracts `sub` / `email` /
  `name`. Routes marked `@Public()` are exempt.
- **`@CurrentUser()`**: injects the resolved local user (looked up by
  `authProviderId`).
- **`RolesGuard` + `@Roles(...)`**: role-based authorization.

### `POST /v1/auth/sync-user` (authenticated)

Request:

```json
{ "role": "PATIENT", "referralCode": "NUTRI-12345" }
```

Behavior (idempotent):

1. Validate JWT; extract `sub`, `email`, `name`.
2. If no local `User` for `(SUPABASE, sub)`: create `User` + the matching profile
   (`NutritionistProfile` **or** `PatientProfile`, per `role`).
3. If the `User` exists: update `name` / `email`.
4. If `referralCode` is supplied and `role` is `PATIENT`: resolve the
   nutritionist by `referralCode` and set `nutritionistId`. Unknown code →
   validation error.

### `GET /v1/auth/me` (authenticated)

Returns the local user + its profile.

## Config, Docker, Local Dev

- `.env` keys: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_JWT_SECRET`, `OPENAI_API_KEY` (placeholder, unused this sub-project).
- Env validated at boot — the app does not start with missing/invalid env.
- `docker-compose.yml`: `postgres` service. Prisma scripts: `pnpm db:migrate`,
  `pnpm db:studio`.
- `.env.example` is versioned; `.env` is gitignored.

## Error Handling and Validation

- Global `ValidationPipe` (whitelist + transform) over class-validator DTOs.
- Global exception filter → consistent JSON error shape
  `{ statusCode, message, error }`.
- Logging uses NestJS's default logger for now. **pino/nestjs-pino is deferred to
  the Observability sub-project (Step 09).**

## Testing Strategy (TDD)

- **Unit:**
  - `AuthService` sync-user: creation, update, referral resolution, idempotency.
  - `referralCode` generator: format + collision retry.
- **e2e:**
  - `/v1/auth/sync-user` and `/v1/auth/me` with JWTs signed locally using
    `SUPABASE_JWT_SECRET` in tests (no live Supabase call).
  - Guard coverage: no token → 401, wrong role → 403.
- Isolated test Postgres.

## Out of Scope (future sub-projects)

Patient management, `ProgressEntry`, meal plans, AI module, AI meal generation,
patient app API, outside-home feature, observability with pino, and clinical
fields on the profiles.
