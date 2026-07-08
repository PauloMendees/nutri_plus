# Step 04 — Meal Plans — Design

Status: approved (2026-06-08)
Supersedes the endpoint/validation details in `docs/04-meal-plans.md` where they differ; the original doc remains the requirements source.

## Goal

Let nutritionists author meal plans for their linked patients (create, read,
update, delete) as a single nested aggregate, and let a patient read their own
plans. No AI generation, PDF export, or version history (deferred to later steps).

## Scope decisions

- **Patient read is in scope for Step 04** (not deferred to Step 07). A logged-in
  patient can list and view their own plans.
- **Whole-plan nested writes.** A plan and its meals/items are created and edited
  as one tree in a single request, persisted transactionally. No granular
  per-meal / per-item sub-resource endpoints.
- **Draft-friendly.** A nutritionist can save a partial plan and finish later
  (enables frontend autosave). Only `patientId` is required to create a plan.

## Data model

Three new models. `PatientProfile` gains a back-relation `mealPlans MealPlan[]`.
Migration is purely additive (new tables + nullable columns).

```prisma
model MealPlan {
  id          String   @id @default(uuid())
  patientId   String
  patient     PatientProfile @relation(fields: [patientId], references: [id])
  title       String?  // nullable: supports draft / autosave
  objective   String?
  aiGenerated Boolean  @default(false) // server-controlled; always false in Step 04
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  meals       Meal[]
  @@index([patientId])
}

model Meal {
  id           String   @id @default(uuid())
  mealPlanId   String
  mealPlan     MealPlan @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
  name         String?  // nullable: draft
  timeLabel    String?
  instructions String?
  order        Int      // sequence within the plan; server-assigned from array index
  createdAt    DateTime @default(now())
  items        MealItem[]
  @@index([mealPlanId])
}

model MealItem {
  id       String @id @default(uuid())
  mealId   String
  meal     Meal   @relation(fields: [mealId], references: [id], onDelete: Cascade)
  foodName String?  // nullable: draft
  quantity String?  // nullable: draft
  calories Float?
  protein  Float?
  carbs    Float?
  fats     Float?
  order    Int      // sequence within the meal; server-assigned from array index
  @@index([mealId])
}
```

### Model rationale

- **`onDelete: Cascade`** (Meal→MealPlan, MealItem→Meal). Deliberately opposite to
  `BodyAssessment`'s `RESTRICT` (immutable history). A meal plan is a mutable, owned
  aggregate: deleting the plan, or replacing its tree on PATCH, removes its meals and
  items in one DB operation.
- **`order Int`** on Meal and MealItem. Plans are ordered (breakfast → lunch → dinner;
  items within a meal). The client sends meals/items in order; the server persists the
  array index. Reordering = resend the array in the new order. `order` is never
  client-supplied.
- **Nullable draft columns** (`title`, `name`, `foodName`, `quantity`). A `NOT NULL`
  column would reject a half-filled draft `INSERT`. Relaxing `NOT NULL → NULL` is
  non-destructive. `MealPlan.patientId` stays `NOT NULL` — the ownership anchor.

## API surface

Two controllers split by audience, sharing one `MealPlansService` with
role-distinct methods. URI versioning `/v1`.

### Nutritionist routes — `@Roles(NUTRITIONIST)`

Ownership enforced via the patient's `nutritionistId` (same pattern as Patient
Management). Non-owned or missing → **404**, no existence leak.

| Method | Route | Body | Notes |
|---|---|---|---|
| `POST` | `/v1/meal-plans` | `{ patientId, title?, objective?, meals? }` | Verifies the patient belongs to this nutritionist, then creates the whole tree in one transaction. |
| `GET` | `/v1/meal-plans?patientId=` | — | Lists plans for one owned patient. Summary shape: no nested items. |
| `GET` | `/v1/meal-plans/:id` | — | Full nested tree (meals + items, ordered by `order`). |
| `PATCH` | `/v1/meal-plans/:id` | `{ title?, objective?, meals? }` | Tree-replace semantics (below). |
| `DELETE` | `/v1/meal-plans/:id` | — | Hard delete; cascade removes meals + items. |

### Patient routes — `@Roles(PATIENT)`

Ownership via the caller's own `patientProfile.id`.

| Method | Route | Notes |
|---|---|---|
| `GET` | `/v1/me/meal-plans` | The patient's own plans (list). |
| `GET` | `/v1/me/meal-plans/:id` | One own plan, full tree; 404 if not theirs. |

`/v1/me/...` namespace keeps role-scoped surfaces cleanly separated and gives
Step 07 (Patient App API) a natural place to extend.

### PATCH replace semantics

- Top-level fields (`title`, `objective`) patch normally (only fields present are changed).
- If `meals` is **present** in the body, the entire meals/items tree is **replaced**:
  delete existing meals (cascade removes their items) → recreate from payload, inside a
  transaction. Avoids fragile per-node diffing; matches "plans are authored as a unit."
- If `meals` is **omitted**, the existing tree is left untouched.
- `patientId` cannot be changed (plan reassignment is out of MVP scope) — omitted from
  the update DTO.

## Validation & DTOs

class-validator DTOs. The global `ValidationPipe` (`whitelist + transform +
forbidNonWhitelisted`) rejects unknown fields with 400 — drafts are permissive about
*missing* data but strict about *unexpected* data.

- **`CreateMealPlanDto`**: `patientId` (`@IsUUID`, **required**); `title?`, `objective?`
  (`@IsString @IsOptional`); `meals?: MealDto[]` (`@IsOptional @ValidateNested({ each: true })
  @Type(() => MealDto)`). `aiGenerated` is not accepted from input (server sets `false`).
- **`MealDto`**: `name?`, `timeLabel?`, `instructions?` (all optional strings);
  `items?: MealItemDto[]` (nested-validated).
- **`MealItemDto`**: `foodName?`, `quantity?` (optional strings); `calories?`, `protein?`,
  `carbs?`, `fats?` (`@IsOptional @Min(0)`).
- **`UpdateMealPlanDto`**: same shape as create minus `patientId`. Presence of `meals`
  triggers tree-replace.
- `order` is never in any DTO — server-assigned from array index.

A minimal valid create is `{ patientId }` → an empty draft plan.

## Error handling

Reuses existing global filters/guards.

- Non-owned / missing plan or patient → **404** (`NotFoundException`), no existence leak.
- `patientId` not owned by the nutritionist on create → **404**.
- PATIENT hitting nutritionist routes, or NUTRITIONIST hitting `/me` routes → **403** (RolesGuard).
- Malformed body / unknown field → **400** (ValidationPipe).

## Testing strategy

Mirrors the green Patient Management coverage.

**Unit (`meal-plans.service.spec.ts`, `mockDeep` Prisma):**
- `createPlan`: ownership checked before write; minimal `{ patientId }` draft succeeds;
  non-owned `patientId` → 404; nested tree persisted with `order` from array index.
- `getPlan` / `listPlans`: owned → returns; non-owned/missing → 404.
- `updatePlan`: top-level patch leaves tree untouched when `meals` omitted; `meals`
  present → tree replaced (delete + recreate) in a transaction.
- `deletePlan`: owned → deletes; non-owned → 404.
- Patient methods: a patient reads only their own plans; another patient's id → 404.

**E2E (`meal-plans.e2e-spec.ts`, local test DB + JWKS harness):**
- Nutritionist lifecycle: create (full tree + empty draft) → list → get (ordered tree)
  → patch (top-level + tree-replace) → delete (assert cascade: meals/items gone).
- Patient `/me/meal-plans` happy path + cross-patient 404.
- Role enforcement: PATIENT → nutritionist routes = 403; NUTRITIONIST → `/me` routes = 403.
- ValidationPipe: unknown field → 400.
- Cascade verification: after DELETE, no orphaned `Meal`/`MealItem` rows.
- `setup-e2e.ts` truncation order updated: `mealItem → meal → mealPlan` deleted before
  their parents (FK order).

**Swagger:** all DTOs/endpoints auto-documented via the CLI plugin; `/docs-json` smoke
test gains the new paths.

## Non-goals (unchanged from `docs/04-meal-plans.md`)

- AI meal generation (Step 06)
- PDF export
- Version history
- Plan reassignment between patients
- Granular per-meal / per-item sub-resource endpoints
