# TACO Food Database + Search (A1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Brazilian food-composition (TACO) database with an accent-insensitive search API, a reusable food-search component, and an "Alimentos" browse page.

**Architecture:** A global `Food` catalog seeded from a bundled, normalized TACO JSON; a `foods` search API; web data-layer + reusable picker + browse page. Foundation for A2 (food-based meal items).

**Tech Stack:** NestJS + Prisma (ts-node seed), Next.js + react-query, `@nutri-plus/shared-types`.

## Global Constraints

- Branch `feat/taco-food-database` (off main; spec committed 3419acc). Additive migration. shared-types rebuilt. **NO new dependencies** (de-accent via built-in `String.normalize`; seed runs on the already-present `ts-node`; NO Postgres `unaccent` extension).
- `Food` is a **global** catalog (public read for authenticated nutritionists — no per-tenant rows / no PII). pt-BR.
- **Pinned TACO source:** `https://raw.githubusercontent.com/marcelosanto/tabela_taco/main/TACO.json` (NEPA/UNICAMP data, 597 foods — attribute TACO in the seed/data header). The seed asserts it loaded **≥ 500** foods.
- Accent-insensitive search via the stored `searchName` column + `normalizeSearch` on the query term.
- Match file quote styles (api single quotes; web per-file). API + mobile tests JEST / web vitest.
- Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push/PR.

**Source shape (each of the 597 array entries):** `{ id: number, description: string, category: string, energy_kcal: number|"NA"|"Tr"|"", protein_g, lipid_g, carbohydrate_g, fiber_g, sodium_mg, … many more }`. **Mapping to `Food`:** `tacoId=id`, `name=description`, `group=category`, `energyKcal=norm(energy_kcal)`, `protein=norm(protein_g)`, `carbohydrate=norm(carbohydrate_g)`, `lipid=norm(lipid_g)`, `fiber=norm(fiber_g)`, `sodium=norm(sodium_mg)`, `searchName=normalizeSearch(description)`. `norm(v)`: `"Tr"→0`; `"NA"|"*"|""|null|undefined → null`; else `Number(v)`.

---

### Task 1: Foundation — Food model, shared-types, normalizeSearch

**Files:** `apps/api/prisma/schema.prisma` (+ migration); `packages/shared-types/src/v1/food.ts` + `index.ts`; `apps/api/src/foods/normalize.ts` + `normalize.spec.ts`.

- [ ] **Step 1: Prisma model**

Add to `apps/api/prisma/schema.prisma`:
```prisma
model Food {
  id           String   @id @default(uuid())
  tacoId       Int?     @unique
  name         String
  searchName   String
  group        String?
  energyKcal   Float?
  protein      Float?
  carbohydrate Float?
  lipid        Float?
  fiber        Float?
  sodium       Float?
  createdAt    DateTime @default(now())

  @@index([searchName])
}
```

- [ ] **Step 2: Migrate + generate**

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name food-catalog`
Expected: additive `CREATE TABLE "Food"` + index, applied, client regenerated (run `prisma generate` if not).

- [ ] **Step 3: shared-types**

Create `packages/shared-types/src/v1/food.ts`:
```ts
export interface Food {
  id: string;
  tacoId: number | null;
  name: string;
  group: string | null;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  lipid: number | null;
  fiber: number | null;
  sodium: number | null;
}
```
Add `export * from './food';` to `packages/shared-types/src/v1/index.ts`. Build: `pnpm --filter @nutri-plus/shared-types build` (exit 0).

- [ ] **Step 4: Failing test for normalizeSearch**

Create `apps/api/src/foods/normalize.spec.ts`:
```ts
import { normalizeSearch } from './normalize';

describe('normalizeSearch', () => {
  it('lowercases, trims, and strips diacritics', () => {
    expect(normalizeSearch('  Açúcar Mascavo ')).toBe('acucar mascavo');
    expect(normalizeSearch('Pão de Queijo')).toBe('pao de queijo');
    expect(normalizeSearch('ARROZ')).toBe('arroz');
  });
});
```
Run: `pnpm --filter @nutri-plus/api test -- normalize` → FAIL.

- [ ] **Step 5: Implement normalizeSearch**

Create `apps/api/src/foods/normalize.ts`:
```ts
// Lowercased, trimmed, diacritic-free form for accent-insensitive matching.
export function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
```
Run: `pnpm --filter @nutri-plus/api test -- normalize` → PASS.

- [ ] **Step 6: Commit** (`feat: Food catalog model + shared type + normalizeSearch`).

---

### Task 2: TACO data + seed

**Files:** `apps/api/src/foods/taco-mapper.ts` + `taco-mapper.spec.ts`; a one-off generator `apps/api/scripts/generate-taco-json.ts`; `apps/api/prisma/data/taco.json` (generated, committed); `apps/api/prisma/seed.ts`; `apps/api/package.json` (`prisma.seed`).

**Consumes:** `normalizeSearch` (Task 1). **Produces:** a seeded `Food` table (≥ 500 rows).

- [ ] **Step 1: Failing test for the row mapper**

Create `apps/api/src/foods/taco-mapper.spec.ts`:
```ts
import { mapTacoRow, normTacoValue } from './taco-mapper';

describe('normTacoValue', () => {
  it('maps Tr→0, NA/*/empty→null, numbers through', () => {
    expect(normTacoValue('Tr')).toBe(0);
    expect(normTacoValue('NA')).toBeNull();
    expect(normTacoValue('*')).toBeNull();
    expect(normTacoValue('')).toBeNull();
    expect(normTacoValue(null)).toBeNull();
    expect(normTacoValue(2.58825)).toBeCloseTo(2.58825, 5);
  });
});

describe('mapTacoRow', () => {
  it('maps a TACO source row to the Food shape', () => {
    const row = {
      id: 1,
      description: 'Arroz, integral, cozido',
      category: 'Cereais e derivados',
      energy_kcal: 123.5,
      protein_g: 2.58,
      carbohydrate_g: 25.8,
      lipid_g: 1.0,
      fiber_g: 2.74,
      sodium_mg: 1.24,
    };
    expect(mapTacoRow(row)).toEqual({
      tacoId: 1,
      name: 'Arroz, integral, cozido',
      group: 'Cereais e derivados',
      searchName: 'arroz, integral, cozido',
      energyKcal: 123.5,
      protein: 2.58,
      carbohydrate: 25.8,
      lipid: 1.0,
      fiber: 2.74,
      sodium: 1.24,
    });
  });
});
```
Run: `pnpm --filter @nutri-plus/api test -- taco-mapper` → FAIL.

- [ ] **Step 2: Implement the mapper**

Create `apps/api/src/foods/taco-mapper.ts`:
```ts
import { normalizeSearch } from './normalize';

export function normTacoValue(v: unknown): number | null {
  if (v === 'Tr') return 0;
  if (v === 'NA' || v === '*' || v === '' || v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export interface TacoRow {
  id: number;
  description: string;
  category: string;
  energy_kcal: unknown;
  protein_g: unknown;
  carbohydrate_g: unknown;
  lipid_g: unknown;
  fiber_g: unknown;
  sodium_mg: unknown;
}

export interface SeedFood {
  tacoId: number;
  name: string;
  group: string;
  searchName: string;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  lipid: number | null;
  fiber: number | null;
  sodium: number | null;
}

export function mapTacoRow(row: TacoRow): SeedFood {
  return {
    tacoId: row.id,
    name: row.description,
    group: row.category,
    searchName: normalizeSearch(row.description),
    energyKcal: normTacoValue(row.energy_kcal),
    protein: normTacoValue(row.protein_g),
    carbohydrate: normTacoValue(row.carbohydrate_g),
    lipid: normTacoValue(row.lipid_g),
    fiber: normTacoValue(row.fiber_g),
    sodium: normTacoValue(row.sodium_mg),
  };
}
```
Run: `pnpm --filter @nutri-plus/api test -- taco-mapper` → PASS.

- [ ] **Step 3: Generate the bundled taco.json**

Create `apps/api/scripts/generate-taco-json.ts` (a one-off; fetches the pinned source and writes the normalized array):
```ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mapTacoRow, TacoRow } from '../src/foods/taco-mapper';

const SOURCE = 'https://raw.githubusercontent.com/marcelosanto/tabela_taco/main/TACO.json';

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const rows = (await res.json()) as TacoRow[];
  const foods = rows.map(mapTacoRow);
  if (foods.length < 500) throw new Error(`expected >= 500 foods, got ${foods.length}`);
  const dir = join(__dirname, '..', 'prisma', 'data');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'taco.json'), JSON.stringify(foods, null, 0));
  console.log(`wrote ${foods.length} foods`);
}
main();
```
Run it once: `pnpm --filter @nutri-plus/api exec ts-node apps/api/scripts/generate-taco-json.ts` (from repo root; adjust path so ts-node resolves — run from `apps/api`: `cd apps/api && pnpm exec ts-node scripts/generate-taco-json.ts`). Expected: "wrote 597 foods" and `apps/api/prisma/data/taco.json` created. **Commit `taco.json`** (it is the bundled dataset). If the network fetch is unavailable in the run environment, a raw copy already exists at `/tmp/taco_probe.json` (same source) — read it instead of fetching. Add a one-line attribution comment at the top of `seed.ts` (below).

- [ ] **Step 4: Seed**

Create `apps/api/prisma/seed.ts` — the `PrismaClient` construction mirrors `apps/api/src/prisma/prisma.service.ts` verbatim (Prisma 7 needs the `@prisma/adapter-pg` adapter with `DATABASE_URL`; `new PrismaClient()` without it fails). The generated client lives at `apps/api/src/generated/prisma/client`, so from `prisma/seed.ts` the import path is `../src/generated/prisma/client`. `prisma db seed` loads `.env`, so `process.env.DATABASE_URL` is populated:
```ts
// Seeds the global Food catalog from the bundled TACO dataset
// (Tabela Brasileira de Composição de Alimentos — NEPA/UNICAMP).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { SeedFood } from '../src/foods/taco-mapper';

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
  });
  const foods = JSON.parse(
    readFileSync(join(__dirname, 'data', 'taco.json'), 'utf8'),
  ) as SeedFood[];
  if (foods.length < 500) throw new Error(`taco.json has < 500 foods (${foods.length})`);
  for (const f of foods) {
    await prisma.food.upsert({
      where: { tacoId: f.tacoId },
      update: f,
      create: f,
    });
  }
  const count = await prisma.food.count();
  if (count < 500) throw new Error(`Food count < 500 after seed (${count})`);
  console.log(`seeded ${count} foods`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```
(If `ts-node prisma/seed.ts` can't resolve the generated client or ESM/CJS clashes, run it with the API's tsconfig: `"seed": "ts-node --project tsconfig.json prisma/seed.ts"` — no new dep.)
Wire the runner in `apps/api/package.json` (ts-node is already a devDep):
```json
  "prisma": { "seed": "ts-node prisma/seed.ts" }
```

- [ ] **Step 5: Run the seed + verify**

Run: `pnpm --filter @nutri-plus/api exec prisma db seed`
Expected: "seeded 597 foods" (≥ 500). Re-run once to confirm idempotency (still 597, no duplicates — upsert by `tacoId`).

- [ ] **Step 6: Verify + commit**

`pnpm --filter @nutri-plus/api test -- taco-mapper` (PASS) + `pnpm --filter @nutri-plus/api exec tsc --noEmit` (exit 0). Commit the mapper, generator, `prisma/data/taco.json`, `seed.ts`, and the package.json change (`feat(api): TACO dataset + idempotent Food seed`).

---

### Task 3: Foods search API

**Files:** `apps/api/src/foods/foods.service.ts`, `foods.controller.ts`, `foods.module.ts`, `foods.service.spec.ts`; `apps/api/src/app.module.ts` (register).

**Consumes:** `normalizeSearch` (Task 1); the seeded `Food` table. **Produces:** `GET /v1/foods?q=&limit=`.

- [ ] **Step 1: Failing service spec**

Create `apps/api/src/foods/foods.service.spec.ts` (mock PrismaService): `search('')` and `search('a')` (< 2 chars) → `[]` without calling prisma; `search('açúcar', 10)` → calls `prisma.food.findMany({ where: { searchName: { contains: 'acucar' } }, orderBy: { name: 'asc' }, take: 10 })` and returns its result; `limit` clamps to max 50 and defaults to 20. Run → FAIL.

- [ ] **Step 2: Service**

Create `apps/api/src/foods/foods.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeSearch } from './normalize';

@Injectable()
export class FoodsService {
  constructor(private readonly prisma: PrismaService) {}

  search(q: string, limit?: number) {
    const term = (q ?? '').trim();
    if (term.length < 2) return Promise.resolve([]);
    const take = Math.min(limit && limit > 0 ? limit : 20, 50);
    return this.prisma.food.findMany({
      where: { searchName: { contains: normalizeSearch(term) } },
      orderBy: { name: 'asc' },
      take,
    });
  }
}
```

- [ ] **Step 3: Controller + module + registration**

Create `foods.controller.ts` (mirror the Silhueta controller's auth/versioning — READ `apps/api/src/silhueta/silhueta.controller.ts`):
```ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { FoodsService } from './foods.service';

@ApiTags('foods')
@ApiBearerAuth()
@Controller({ path: 'foods', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class FoodsController {
  constructor(private readonly foods: FoodsService) {}

  @Get()
  search(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.foods.search(q ?? '', limit ? Number(limit) : undefined);
  }
}
```
Create `foods.module.ts` (`@Module({ controllers: [FoodsController], providers: [FoodsService] })` — Prisma is `@Global`). Register `FoodsModule` in `apps/api/src/app.module.ts`.

- [ ] **Step 4: Run spec + full API + commit**

`pnpm --filter @nutri-plus/api test -- foods` (PASS), `pnpm --filter @nutri-plus/api test`, `pnpm --filter @nutri-plus/api exec tsc --noEmit`. Commit (`feat(api): foods search endpoint`).

---

### Task 4: Web — data layer, FoodSearch, Alimentos page

**Files:** `apps/web/src/lib/api/foods.ts`, `lib/queries/foods.ts`, `components/foods/food-search.tsx` (+ test), `app/(app)/alimentos/page.tsx`, `components/app/nav-items.ts`.

- [ ] **Step 1: Data layer**

Create `apps/web/src/lib/api/foods.ts`:
```ts
import type { Food } from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function searchFoods(q: string, limit = 20): Promise<Food[]> {
  return browserApiFetch<Food[]>(`/foods?q=${encodeURIComponent(q)}&limit=${limit}`);
}
```
Create `lib/queries/foods.ts`:
```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { searchFoods } from '@/lib/api/foods';

export function useFoodSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ['foods', term],
    queryFn: () => searchFoods(term),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 2: FoodSearch component (failing test first)**

`components/foods/food-search.test.tsx` (vitest): mock `@/lib/queries/foods` (`useFoodSearch` returns a food fixture); render `<FoodSearch onSelect={fn} />`; typing "arroz" shows the result "Arroz, integral, cozido" with its kcal; clicking it calls `onSelect` with that food; `< 2` chars renders no results. Run → FAIL.

Implement `components/foods/food-search.tsx` (`'use client'`): a controlled text input (debounced via `useDebouncedValue` from `@/lib/hooks/use-debounced-value`, 300ms) → `useFoodSearch(debounced)` → a results list (each row: `name` · `group` · `energyKcal` kcal/100g), each a button calling `onSelect?.(food)`. Props `{ onSelect?: (food: Food) => void; placeholder?: string }`. pt-BR empty/hint text.

- [ ] **Step 3: Alimentos page + nav**

Create `app/(app)/alimentos/page.tsx` — a client browse view (or a server page rendering a client `FoodsBrowse`): a search box (reuse `FoodSearch` or its hook) + a results table (colunas: Alimento, Grupo, Energia, Proteína, Carboidrato, Gordura, Fibra, Sódio — todos "/100g"). pt-BR headings; render `—` for null nutrients.

In `apps/web/src/components/app/nav-items.ts`, add a lucide icon import (e.g. `Apple`) and an entry after Pacientes:
```ts
  { label: 'Alimentos', href: '/alimentos', icon: Apple },
```

- [ ] **Step 4: Run + tsc + commit**

`pnpm --filter @nutri-plus/web test -- food-search foods` (PASS) + `pnpm --filter @nutri-plus/web exec tsc --noEmit` (exit 0) + full web suite. Commit (`feat(web): food search + Alimentos browse page`).

---

## Final verification

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```

Manual: `prisma db seed` populates ≥ 500 foods; open "Alimentos" → type "acucar" (no accent) → "Açúcar…" foods appear with per-100g macros; the FoodSearch picker returns results and fires onSelect (verified via its test, consumed by A2 next).
