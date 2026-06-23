# Appointment Categories — Design

**Date:** 2026-06-23
**Status:** Approved (pending implementation plan)
**Scope:** A new **Categoria** entity for appointments: nutritionist/employee can create/edit/delete categories (name, optional color, one optional default); creating an appointment can pick a category (default preselected; picking it fills the title); the calendar/list/day-panel/tooltip color each appointment by its category (green fallback). Managed from a new sidebar sub-item under Agenda.
**Builds on:** the agenda UI + the appointments API. **Lands on `feat/agenda-ui`** (rides in PR #16 — the user keeps everything on that branch). Backend gets a new entity + migration; web extends the agenda.

---

## 1. Goal

Categories let a nutritionist standardize appointment types (e.g. "Consulta", "Retorno", "Avaliação") with a color and a default, speeding up scheduling and making the calendar readable at a glance.

Done when: categories have full CRUD scoped to the nutritionist; only one category can be default (enforced server-side); the appointment dialog offers a category select with the default preselected and auto-fills the title from the chosen category; appointments persist a `categoryId`; the calendar chip, list row, day-panel row, and hover tooltip render in the category's color (green fallback); categories are managed at `/agenda/categorias`, reachable from a new **Categorias** sub-item under **Agenda** in the sidebar.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Name | **Categoria** (entity `AppointmentCategory`). |
| Management UI | A **sidebar sub-item** under Agenda → page `/agenda/categorias`. |
| Branch | Everything on **`feat/agenda-ui`** (PR #16). |
| Color input | A fixed **swatch palette** + "Sem cor" (no free hex picker). |
| `isDefault` control | A styled **native `<input type="checkbox">`** (no new primitive) **with a tooltip** explaining it. |
| Delete behavior | `Appointment.category` FK is `onDelete: SetNull` — deleting a category un-colors its appointments (their copied title is unaffected). |
| Auto-default | Categories are NOT auto-defaulted; the user explicitly marks one. |

## 3. Backend (`apps/api`)

### 3.1 Prisma + migration
- **New model `AppointmentCategory`:** `id (uuid)`, `nutritionistId` + `nutritionist NutritionistProfile @relation`, `name String`, `color String?` (hex like `#14BFA6`), `isDefault Boolean @default(false)`, `createdAt`, `updatedAt`, `appointments Appointment[]`, `@@index([nutritionistId])`.
- **`Appointment`:** add `categoryId String?` + `category AppointmentCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)`.
- **`NutritionistProfile`:** add `appointmentCategories AppointmentCategory[]`.
- **Migration:** `pnpm --filter @nutri-plus/api exec prisma migrate dev --name add_appointment_category` then `prisma generate`. Additive (new table + nullable column) — safe on the shared hosted Supabase dev DB.

### 3.2 `appointment-categories` module (mirrors `appointments`)
Endpoints (`@Controller({ path: 'appointment-categories', version: '1' })`, `@Roles(NUTRITIONIST, EMPLOYEE)`, scoped via `resolveScopeNutritionistId`):
- `POST /v1/appointment-categories` — `CreateAppointmentCategoryDto` `{ name (req, ≤100), color? (hex or null), isDefault? }`.
- `GET /v1/appointment-categories` — the nutritionist's categories (ordered: default first, then name asc).
- `GET /v1/appointment-categories/:id` — `404` if not owned.
- `PATCH /v1/appointment-categories/:id` — `UpdateAppointmentCategoryDto` (all optional; `color` nullable).
- `DELETE /v1/appointment-categories/:id` — `204`; `404` if not owned (FK SetNull un-links appointments).

**Default uniqueness (service):** when creating/updating with `isDefault: true`, in a `prisma.$transaction` set `isDefault = false` on the nutritionist's other categories, then write this one as default. Color validated as a `#RRGGBB` hex (or null/omitted).

### 3.3 Appointments integration
- `CreateAppointmentDto` + `UpdateAppointmentDto` gain `categoryId?` (`@IsUUID`, optional; nullable on PATCH to unlink).
- Service: when `categoryId` is set, assert it belongs to the nutritionist (`assertCategoryOwned`, mirroring `assertPatientOwned`); persist it.
- `APPOINTMENT_INCLUDE` adds `category: { select: { id: true, name: true, color: true } }` so list/detail responses carry the color + name.

## 4. shared-types (`packages/shared-types/src/v1`)
- New `appointment-category.ts`: `AppointmentCategory { id, nutritionistId, name, color: string | null, isDefault, createdAt, updatedAt }`; `AppointmentCategorySummary { id, name, color: string | null }`; `CreateAppointmentCategoryRequest { name; color?; isDefault? }`; `UpdateAppointmentCategoryRequest` (all optional; `color`/`name` patchable, `color` nullable).
- `appointment.ts`: `Appointment` gains `categoryId: string | null` + `category: AppointmentCategorySummary | null`; `CreateAppointmentRequest`/`UpdateAppointmentRequest` gain `categoryId?` (nullable on update). Export from `index.ts`.

## 5. Web (`apps/web`)

### 5.1 Data layer
- `lib/api/appointment-categories.ts` — `listAppointmentCategories`, `createAppointmentCategory`, `updateAppointmentCategory`, `deleteAppointmentCategory` (via `browserApiFetch`).
- `lib/queries/appointment-categories.ts` — `useAppointmentCategories()` (key `['appointment-categories']`), `useCreate/Update/DeleteAppointmentCategory()` (invalidate `['appointment-categories']` and `['appointments']`, since appointment colors depend on categories).

### 5.2 Sidebar sub-items
- `nav-items.ts`: `NavItem` gains optional `children?: { label; href }[]`. Agenda becomes `{ label: 'Agenda', href: '/agenda', icon: Calendar, children: [{ label: 'Agenda', href: '/agenda' }, { label: 'Categorias', href: '/agenda/categorias' }] }`.
- `app-sidebar.tsx`: for an item with `children`, render the parent `SidebarMenuButton` (links to its `href`) plus a `SidebarMenuSub` with a `SidebarMenuSubButton` per child (active by `pathname`). Items without `children` render as today. Mobile sheet still closes on any nav tap.

### 5.3 Category management page `/agenda/categorias`
- A `CategoriesView` (client): header "Categorias" + "Nova categoria" button; a list of cards/rows — color swatch + name + a "Padrão" badge when default — each with edit + delete. States: loading skeleton, empty ("Nenhuma categoria ainda" + CTA), error + retry. A back-aware page under `(app)`.
- **`CategoryDialog`** (create/edit, reuses the `dialog` primitive + react-hook-form + zod):
  - **Nome** (`Input`, req, ≤100).
  - **Cor**: a row of preset swatch buttons (selectable) + a "Sem cor" option → stores the hex or `null`. Palette: `#14BFA6` (teal), `#0A5C45` (verde), `#3B82F6` (azul), `#8B5CF6` (roxo), `#F59E0B` (âmbar), `#EF4444` (vermelho), `#EC4899` (rosa), `#6B7280` (cinza).
  - **Marcar como padrão**: native `<input type="checkbox">` + label, with an **info tooltip** (shadcn `Tooltip`, an `ⓘ`/help trigger): "A categoria padrão vem pré-selecionada ao criar um agendamento. Só uma categoria pode ser padrão."
  - Submit → create/update; edit shows **Excluir**. Errors via `ApiError` → friendly pt-BR.
- Validation `categoryFormSchema` (zod): name min 1 / max 100; color is `null` or `#RRGGBB`; isDefault boolean.

### 5.4 Appointment dialog integration
- Add a **Categoria** `Select` (above Título; options from `useAppointmentCategories()`, plus "Sem categoria"). On **create**, preselect the default category (if any) and set the title to its name. **Selecting/changing the category sets the Título field to the category's name** (overwrite; still editable). Submit sends `categoryId` (or `null`).
- On **edit**, prefill the category from `appointment.categoryId`; changing it re-fills the title.

### 5.5 Coloring
- Helper `appointmentColor(appointment)` → `appointment.category?.color ?? null`. Components apply an **inline color only when it is non-null**, and otherwise keep the existing brand classes — so the green fallback always matches the current look exactly (no hardcoded hex that could drift from the `--primary` token).
- **Calendar chip:** when a color exists, `style={{ borderLeftColor: color }}`; otherwise keep the static `border-primary`. Keep the rest of the chip styling.
- **List row & day-panel row:** a small leading color dot — `style={{ backgroundColor: color }}` when present, else the `bg-primary` class.
- **Hover tooltip:** the same small color dot beside the title.
- So a category with no color (or no category at all) renders exactly as today (brand green).

## 6. Error handling
- Forms: inline zod messages (pt-BR). API errors via `ApiError` (`instanceof`) → friendly pt-BR; generic fallback. Mutations disable submit while pending; invalidate the right query keys.
- Deleting a category in use is allowed (FK SetNull); a short confirm in the dialog/list.

## 7. Testing
- **API (Jest):** category service — create/list/get/update/delete scoped to the nutritionist; **default uniqueness** (setting a second default unsets the first); color hex validation; `404` on others' categories. Appointment service — `categoryId` ownership assertion; category included in responses; deleting a category nulls the appointment's `categoryId`. `env`/DTO validation as needed.
- **Web (Vitest + RTL):** categories API funcs (paths/methods/body); `categoryFormSchema`; `CategoryDialog` (create/edit/delete, color select, isDefault + tooltip text); categories list (states); sidebar renders the Agenda sub-items and marks the active one; appointment dialog (default preselected + title auto-fill on category change; sends `categoryId`); `appointmentColor` fallback + that a colored chip uses the category color.

## 8. Out of scope (YAGNI)
Per-category icons; reordering categories; category usage counts/analytics; sharing categories across nutritionists; a full hex/eyedropper color picker; bulk recategorization. Auto-marking the first category as default.
