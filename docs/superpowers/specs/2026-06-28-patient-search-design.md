# Patient list search + pagination (server-side) — Design

**Date:** 2026-06-28
**Status:** Approved (pending implementation plan)
**Scope:** Add server-side **search** and **pagination** to the patients list (`/patients`). Today `GET /v1/patients` returns every patient unpaginated and the web `PatientsList` has no search (unlike `EmployeesView`, which has a client-side name filter). This makes the patient list searchable and paginated at the backend.
**Builds on:** `PatientsService.listPatients` + `PatientsController` `@Get()` (`@Roles(NUTRITIONIST, EMPLOYEE)`, scoped by `resolveScopeNutritionistId`), `PatientSummary` (whose `user: { id, name, email }` carries the searchable fields), the web `usePatients`/`listPatients` + `PatientsList`, and the existing list UI conventions (loading/error/empty states, mobile cards + desktop table). New feature branch `feat/patient-search`.

---

## 1. Goal

A nutritionist (or their employee) can find a patient by name or e-mail and page through the list without loading every record. Done when: `GET /v1/patients` accepts `search`, `page`, and `pageSize` and returns a paginated envelope (`items` + `total`/`page`/`pageSize`/`totalPages`), scoped to the caller's nutritionist; the patients page shows a search box (debounced, matches name or e-mail), an "Anterior/Próxima" pager with "Página X de Y", and the total count; searching resets to page 1; a search with no matches shows a clear empty state; the previous page stays visible (no flicker) while the next loads.

## 2. Context

- `PatientsService.listPatients(ctx)` does `patientProfile.findMany({ where: { nutritionistId }, include: { user: { select: { id, name, email } } } })` — all rows, no order, no search.
- The patient's **name and e-mail live on the related `User`** (`PatientProfile.user`), so server-side search filters the `user` relation. `nutritionistId` scoping is mandatory and unchanged.
- The web `usePatients()` takes no args (key `['patients']`); `PatientsList` renders `query.data` directly in two layouts. Patient mutations (create/update) invalidate `['patients']`.
- `EmployeesView` is the visual reference for the search input + "Nenhum … encontrado" state (but it filters client-side; patients go server-side).

## 3. Locked decisions

| Decision | Choice |
|---|---|
| Where | **Server-side** search AND pagination. |
| Pagination style | **Offset/page-based** with a total: response `{ items, total, page, pageSize, totalPages }`; UI "Anterior/Próxima" + "Página X de Y". |
| Page size | Fixed **20** (server default; capped at 100). No page-size selector. |
| Search fields | `user.name` OR `user.email`, **case-insensitive `contains`**. |
| Ordering | **Alphabetical by `user.name` ascending** (stable order for paging; expected for a searchable directory). |
| Search ↔ page | Changing the search term resets to page 1. The total reflects the filtered count. |
| No-flicker | React Query `placeholderData: keepPreviousData` — the current page stays visible while the next/search loads, with a subtle "Atualizando…" hint. |
| Debounce | ~300 ms on the search input before it hits the server. |

## 4. Backend — API

- **`apps/api/src/patients/dto/list-patients-query.dto.ts`** (new) `ListPatientsQueryDto`:
  - `search?: string` — `@IsOptional() @IsString()`.
  - `page?: number` — `@Type(() => Number) @IsInt() @Min(1)`, default `1` (query strings → numbers).
  - `pageSize?: number` — `@Type(() => Number) @IsInt() @Min(1) @Max(100)`, default `20`.
- **`PatientsController`** `@Get()` → `list(ctx, @Query() query: ListPatientsQueryDto)` → `listPatients(ctx, query)`. Roles unchanged.
- **`PatientsService.listPatients(ctx, params)`**:
  - `const page = params.page ?? 1; const pageSize = params.pageSize ?? 20;`
  - `const search = params.search?.trim();`
  - `const where = { nutritionistId: resolveScopeNutritionistId(ctx), ...(search ? { user: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } } : {}) };`
  - `const [items, total] = await this.prisma.$transaction([ this.prisma.patientProfile.findMany({ where, include: { user: USER_SUMMARY }, orderBy: { user: { name: 'asc' } }, skip: (page - 1) * pageSize, take: pageSize }), this.prisma.patientProfile.count({ where }) ]);`
  - `return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };`
  - `count` uses the SAME `where` (scoped + searched), so the total matches the filtered result.

## 5. shared-types (`packages/shared-types/src/v1`)

- New `pagination.ts`: `export interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number }` (reusable for future lists). Export from `index.ts`.
- New `ListPatientsParams { search?: string; page?: number; pageSize?: number }` (in `patient.ts`).
- The list endpoint's response is `Paginated<PatientSummary>`.

## 6. Web — data layer

- **`lib/api/patients.ts`** `listPatients(params: ListPatientsParams = {}): Promise<Paginated<PatientSummary>>` — builds a query string from the defined params only (`search` when non-empty, `page`, `pageSize`) and GETs `/patients?…`. (Empty/undefined params are omitted so a bare call still works.)
- **`lib/queries/patients.ts`** `usePatients(params: ListPatientsParams = {})` — `useQuery({ queryKey: ['patients', params], queryFn: () => listPatients(params), placeholderData: keepPreviousData })`. The existing `invalidateQueries({ queryKey: ['patients'] })` in create/update still matches `['patients', …]` by prefix, so cache invalidation keeps working.

## 7. Web — `PatientsList`

- State: `const [search, setSearch] = useState(''); const [page, setPage] = useState(1);` plus `const debouncedSearch = useDebouncedValue(search, 300);`. A `useEffect` resets `page` to 1 whenever `debouncedSearch` changes. Query: `usePatients({ search: debouncedSearch, page, pageSize: 20 })`.
- New tiny hook **`lib/hooks/use-debounced-value.ts`** `useDebouncedValue<T>(value, delayMs): T` (setTimeout in an effect, cleared on change).
- Search `<Input placeholder="Buscar por nome ou e-mail" aria-label="Buscar paciente" className="max-w-sm">`, shown when there are patients OR a search term is active (so a no-result search can be cleared).
- Render `data.items` in the existing two layouts (mobile cards + desktop table) instead of `query.data`.
- **Pager** below the list, only when `totalPages > 1`: "Anterior" (disabled when `page <= 1`) · "Página {page} de {totalPages}" · "Próxima" (disabled when `page >= totalPages`). Buttons update `page`.
- **Count**: "{total} paciente(s)" from the envelope.
- **States**: initial loading skeleton; error + retry (unchanged); empty (`total === 0` and no active search) keeps the "Nenhum paciente ainda" CTA; **no-match** (`total === 0` with an active search) shows "Nenhum paciente encontrado."; while `isFetching` with prior data (page/search change) the list stays visible with a subtle "Atualizando…" indicator. `canCreate` gating unchanged.

## 8. Permissions / errors

Unchanged: the endpoint stays `@Roles(NUTRITIONIST, EMPLOYEE)` and scoped by `resolveScopeNutritionistId`; an employee sees only their employer's patients. Invalid query params are rejected by the global `ValidationPipe` (400). `canCreate` (the "+ Novo paciente" CTA) is still passed from the server page based on role.

## 9. Testing

- **API (Jest):** `patients.service.spec` — `listPatients` builds the scoped `where`; with `search`, adds the `user.OR` name/email **insensitive `contains`**; applies `skip`/`take` from page/pageSize; returns `{ items, total, page, pageSize, totalPages }` with `totalPages = ceil(total/pageSize)`; defaults to page 1 / pageSize 20 when omitted; `count` is called with the same `where`. (The `$transaction` is mocked to resolve `[items, total]`.) The DTO follows the repo's no-DTO-unit-test convention (validated by the global pipe).
- **Web (Vitest + RTL):** `patients` api func builds the query string (search omitted when empty; page/pageSize present). `usePatients` uses the param-scoped key + `keepPreviousData`. `useDebouncedValue` (fake timers) returns the value after the delay. `PatientsList` — renders `items`; typing in the search box queries with the debounced term and resets to page 1; "Anterior/Próxima" change the page and disable at the bounds; "Página X de Y" renders; the no-match state shows for a searched empty result; the count reflects `total`; the pager hides when `totalPages <= 1`. Keep the existing `canCreate` tests (hides header CTA / empty-state CTA).

## 10. Out of scope

A page-size selector; sorting by other columns; filtering by objective/activity; fuzzy/full-text search; infinite scroll; URL-syncing the search/page into query params (state stays component-local).
