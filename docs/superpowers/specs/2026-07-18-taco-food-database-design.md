# TACO Food Database + Search — Design (A1)

**Date:** 2026-07-18
**Branch:** `feat/taco-food-database` (off main)
**Status:** Approved design — ready for implementation plan

**Sub-project A1** of the decomposed "A" feature (A1 food DB + search → A2 food-based meal items + plano-vs-meta → A3 AI grounding + calculator consolidation). A1 builds a Brazilian food-composition database (TACO) with a search API and a reusable food-search UI + a standalone "Alimentos" browse page. A2 will consume the picker in the meal-plan editor.

## Decisions (from brainstorming)

- Nutrients stored per 100 g: **energy (kcal), protein, carbohydrate, lipid (fat), fiber, sodium**.
- **Grams-based** (nutrients per 100 g); household measures ("medida caseira") are deferred.
- Accent-insensitive search via a stored **`searchName`** column (normalized in JS) — no Postgres `unaccent` extension (portable on any Supabase).
- Include a minimal read-only **"Alimentos"** browse page in A1 (standalone usability + end-to-end validation).

## Data model (additive migration)

New **global** reference model `Food` (no patient/nutritionist scope — a shared catalog):
```prisma
model Food {
  id           String  @id @default(uuid())
  tacoId       Int?    @unique          // TACO reference number (idempotent seed)
  name         String                    // pt-BR display name
  searchName   String                    // lowercased + de-accented, for search
  group        String?                   // TACO food group (e.g. "Cereais e derivados")
  energyKcal   Float?                    // per 100 g
  protein      Float?
  carbohydrate Float?
  lipid        Float?
  fiber        Float?
  sodium       Float?
  createdAt    DateTime @default(now())

  @@index([searchName])
}
```
Nutrient fields are nullable — TACO carries `Tr` (trace) and `NA`/`*` (not available) values.

shared-types (`packages/shared-types/src/v1/food.ts`): `Food` interface (`id`, `name`, `group: string | null`, and the 6 nutrient fields as `number | null`; `tacoId` optional). Exported from `v1/index.ts`.

## Import / seed

- Bundle a **normalized public TACO dataset** at `apps/api/prisma/data/taco.json` (~600 foods). TACO is the *Tabela Brasileira de Composição de Alimentos* (NEPA/UNICAMP), freely available — include an attribution note in the JSON/seed header. **The exact public source URL is fixed in the implementation plan**; the seed asserts it imported ≥ 500 foods.
- Normalization rules applied when building/seeding each row: `"Tr"` → `0`; `"NA"`, `"*"`, `""`, `null` → `null`; numeric strings → `Number`. `searchName` = `name` lowercased with diacritics stripped.
- A pure helper `normalizeSearch(s: string): string` (strip diacritics via `String.prototype.normalize('NFD')` + remove combining marks + lowercase + trim) — used by both the seed and the search query. Unit-tested.
- An **idempotent seed** (`apps/api/prisma/seed.ts`, wired via `package.json` `prisma.seed`) upserts each food by `tacoId` (or by `name` when `tacoId` is null). Runs on the shared dev DB via `pnpm --filter @nutri-plus/api exec prisma db seed`.

## Search API

`GET /v1/foods?q=<term>&limit=<n>` — authenticated, `@Roles(NUTRITIONIST)` (a reference catalog any nutritionist may search). Behavior:
- Trim `q`; if `< 2` chars, return `[]` (no full-table scan).
- `where: { searchName: { contains: normalizeSearch(q) } }`, `orderBy: { name: 'asc' }`, `take: min(limit ?? 20, 50)`.
- Returns `Food[]` (id, name, group, the 6 per-100g nutrients). No pagination beyond the limit (a picker only needs the top matches).

New `foods` module (controller + service), registered in `app.module.ts`.

## Web

- `apps/web/src/lib/api/foods.ts`: `searchFoods(q: string): Promise<Food[]>` via `browserApiFetch` (`/foods?q=…`).
- `apps/web/src/lib/queries/foods.ts`: `useFoodSearch(q: string)` (`useQuery`, `queryKey: ['foods', q]`, `enabled: q.trim().length >= 2`, keepPreviousData for smooth typing).
- `apps/web/src/components/foods/food-search.tsx`: a **reusable** `FoodSearch` — a debounced text input + a results list (name · group · kcal/100g); props `{ onSelect?: (food: Food) => void }`. This is the picker A2 embeds in the meal editor.
- A minimal **"Alimentos"** page: `apps/web/src/app/(app)/alimentos/page.tsx` rendering a browse view — a `FoodSearch` (or its own search) + a results table showing name, group, and per-100g energy/protein/carb/fat/fiber/sodium. Add an **"Alimentos"** entry to `nav-items.ts` (after Pacientes).

## Testing

- **API (jest):** `normalizeSearch` (accents/case/trim); the seed row-mapper (`Tr`→0, `NA`/`*`→null, numeric parse, `searchName`) as a pure function; the foods search service (min-length guard → `[]`; normalizes q; applies `contains`/`orderBy`/`take` with the right args — mock prisma).
- **Web (vitest):** `FoodSearch` — typing ≥2 chars calls the search hook and renders results; selecting a result fires `onSelect`; `<2` chars shows nothing/empty. The "Alimentos" page renders the results table from a mocked search.
- **shared-types:** `build` clean.
- Not unit-tested (documented): the full seed run against the DB (verified manually — `db seed` then a count ≥ 500).

## Constraints

- Additive migration on the shared dev DB. shared-types rebuilt. NO new dependencies (de-accent via built-in `String.normalize`, not a new lib or a Postgres extension). pt-BR.
- `Food` is a global catalog (public read for authenticated nutritionists) — no per-tenant rows, no PII.
- Match file quote styles (api single quotes; web per-file). API + mobile tests JEST / web vitest.
- Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push/PR. Branch `feat/taco-food-database`.

## File map

- `apps/api/prisma/schema.prisma` (+ `Food`) + migration; `apps/api/prisma/data/taco.json` (bundled dataset); `apps/api/prisma/seed.ts` + `package.json` prisma.seed
- `apps/api/src/foods/` (module + controller + service + `normalize.ts` + specs)
- `packages/shared-types/src/v1/food.ts` (+ index)
- `apps/web/src/lib/api/foods.ts`, `lib/queries/foods.ts`, `components/foods/food-search.tsx` (+ test), `app/(app)/alimentos/page.tsx`, `components/app/nav-items.ts`
