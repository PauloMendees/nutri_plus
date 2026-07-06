# Contabilidade (Accounting) Module — Design

**Date:** 2026-07-06
**Status:** Approved (design), pending spec review

## Goal

A web "Contabilidade" module where the nutritionist and their employees register
income/expense transactions, view them as a bank-statement-style extrato (with
running balance), and see a monthly bar chart of income vs. expense.

## Overview

A complete, market-standard accounting module spanning API + web + prisma +
shared-types. Transactions and their categories are owned by the
`NutritionistProfile`; both the nutritionist and their employees have full
access, scoped through the existing `resolveScopeNutritionistId`. It mirrors the
established `appointments` / `appointment-categories` module patterns.

This is one cohesive spec (sizable, like the patient-meal-plans one). Natural
build order: data model + shared-types → API (categories → transactions →
statement/summary) → web (categorias → extrato page + form + chart).

## Decisions (from brainstorming)

- **Categories:** managed and **typed** — each `TransactionCategory` is INCOME
  or EXPENSE (e.g. "Consultas" = income, "Aluguel" = expense). A transaction's
  category (optional) must match the transaction's type.
- **Statement:** true bank-statement extrato — server-computed **opening
  balance** (net of everything before the period) + a **running balance** per
  row + period totals.
- **Chart:** monthly income vs. expense **grouped bars** only (no by-category /
  pie chart in v1).
- **Money:** integer **cents** end to end (`amountCents`, always positive;
  direction comes from `type`); formatted `R$ 1.234,56` in the UI.
- **Access:** nutritionist **and** employees get full CRUD (transactions +
  categories), scoped to the nutritionist.

## Out of scope (v1)

- Payment methods, attachments/receipts, recurring transactions.
- By-category or pie charts (only the monthly income/expense bars).
- Multi-currency (BRL only). Opening-balance/manual bank reconciliation beyond
  the computed running balance.

---

## 1. Data model (`apps/api/prisma/schema.prisma`) — additive migration

```prisma
enum TransactionType {
  INCOME
  EXPENSE
}

model TransactionCategory {
  id             String              @id @default(uuid())
  nutritionistId String
  nutritionist   NutritionistProfile @relation(fields: [nutritionistId], references: [id])
  name           String
  type           TransactionType
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  transactions   Transaction[]

  @@index([nutritionistId, type])
}

model Transaction {
  id             String               @id @default(uuid())
  nutritionistId String
  nutritionist   NutritionistProfile  @relation(fields: [nutritionistId], references: [id])
  type           TransactionType
  categoryId     String?
  category       TransactionCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  amountCents    Int                  // always > 0; direction comes from `type`
  occurredOn     DateTime             // the date of the entry (date the money moved)
  description    String?
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt

  @@index([nutritionistId, occurredOn])
}
```

Add the two back-relations to `model NutritionistProfile`:

```prisma
  transactions          Transaction[]
  transactionCategories TransactionCategory[]
```

Deleting a category `SetNull`s its transactions (financial history is never
lost). Migration is additive on the shared dev DB.

## 2. API

Two modules mirroring `appointments` / `appointment-categories`; both controllers
are `@Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)`, take `@CurrentUser() ctx`,
and scope every query with `resolveScopeNutritionistId(ctx)`. Register both in
`AppModule`.

### 2a. `transaction-categories` module (`apps/api/src/transaction-categories/`)

`@Controller({ path: 'transaction-categories', version: '1' })` — full CRUD:
- `POST` create `{ name, type }`
- `GET` list (scoped; optional `?type=` filter) ordered by `name`
- `GET /:id`, `PATCH /:id` `{ name?, type? }`, `DELETE /:id` (204)

DTOs: `CreateTransactionCategoryDto { name: @IsString @IsNotEmpty @MaxLength(80); type: @IsEnum(TransactionType) }`, `UpdateTransactionCategoryDto` (partial). Ownership enforced (a category not in the caller's scope → 404).

### 2b. `transactions` module (`apps/api/src/transactions/`)

`@Controller({ path: 'transactions', version: '1' })`:
- `POST` create; `PATCH /:id`; `DELETE /:id` (204).
- `GET /statement?from&to` → `AccountingStatement` (the full extrato for the
  period — no type/category filter, so the running balance stays coherent):
  - `openingBalanceCents` = net (INCOME − EXPENSE) of all the scope's
    transactions with `occurredOn < from`.
  - `items` = the period's transactions (occurredOn in `[from, to]`), returned
    **newest-first**, each with `balanceCents` = the running balance **after**
    that transaction (openingBalance + cumulative net up to and including it,
    computed chronologically, then presented newest-first).
  - `totals` = `{ incomeCents, expenseCents, netCents }` for the period.
- `GET /monthly-summary?months=12` → `MonthlyAccountingSummary[]` = one entry per
  calendar month for the last `months` months (default 12, ascending), each
  `{ month: 'YYYY-MM', incomeCents, expenseCents }`. Months with no activity are
  present with zeros. Aggregated in-service (fetch the range, group in JS).

**DTOs / validation:**
- `CreateTransactionDto { type: @IsEnum(TransactionType); amountCents: @IsInt @IsPositive; occurredOn: @IsDateString; categoryId?: @IsUUID; description?: @IsString @MaxLength(500) }`.
- `UpdateTransactionDto` (partial).
- Statement `from`/`to` and summary `months` query DTOs (`@IsDateString` /
  `@IsInt @Min(1) @Max(24)`).
- Service rule: if `categoryId` is provided, the category must be in the caller's
  scope **and** `category.type === dto.type` (else 400/404). CRUD is own-scope
  only (cross-scope id → 404).

**Statement/summary computation:** fetch the scoped transactions for the needed
range and reduce in JS (dataset is small per nutritionist). The running balance
is computed by ordering the period's items ascending by `(occurredOn, createdAt)`,
running the cumulative net from `openingBalanceCents`, then presenting
newest-first.

## 3. Web — `apps/web/src/app/(app)/contabilidade`

### Nav (`components/app/nav-items.ts`)
Add `{ label: 'Contabilidade', href: '/contabilidade', icon: Landmark, children: [{ label: 'Extrato', href: '/contabilidade' }, { label: 'Categorias', href: '/contabilidade/categorias' }] }` — no `canAccess` (both roles). `Landmark` from `lucide-react`.

### Extrato page (`/contabilidade`)
- **Period selector** — month picker, default current month (drives the statement + summary cards; the chart is independent, last 12 months).
- **Summary cards** — Entradas (period income), Saídas (period expense), Saldo (net), formatted BRL, green/red/neutral.
- **Monthly bar chart** — recharts grouped `BarChart` from `monthly-summary` (last 12 months): two bars per month, Entradas (green) / Saídas (red), BRL tooltip. Mirrors the recharts usage in `components/patients/bioimpedance-section.tsx`.
- **Statement table** — the extrato: columns Data · Descrição · Categoria (badge) · Valor (signed, green/red) · Saldo (running balance). Shows "Saldo anterior" (opening) and the running balance per row (newest-first). Empty state when no entries.
- **"Nova transação"** button → transaction dialog. Row actions edit/delete.

### Transaction form (dialog, `components/accounting/transaction-form.tsx`)
Fields: **Tipo** (Receita/Saída toggle — filters the category options by type), **Valor** (R$ input parsed to cents), **Data** (defaults today), **Categoria** (select of scope categories matching the chosen type; optional), **Descrição**. Reused for create + edit. Mirrors the dialog/form pattern of `components/patients/create-patient-form.tsx` / `ai-generate-dialog.tsx`.

### Categorias page (`/contabilidade/categorias`)
List + create/edit/delete typed categories (name + Receita/Saída), mirroring `agenda/categorias`.

### Data layer
- `lib/api/transactions.ts`, `lib/api/transaction-categories.ts` (fetch fns).
- `lib/queries/transactions.ts`, `lib/queries/transaction-categories.ts` (react-query hooks with `invalidateQueries` on mutations; statement + monthly-summary + categories keys).
- `lib/format/currency.ts` — `formatBRL(cents: number): string` via `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, and a `parseBRLToCents(input: string): number` for the form.

## 4. shared-types (`packages/shared-types/src/v1`)

New `accounting.ts` (exported from `v1/index.ts`):
- `TransactionType = 'INCOME' | 'EXPENSE'`.
- `TransactionCategory { id; name; type: TransactionType; createdAt; updatedAt }`.
- `Transaction { id; type; categoryId: string | null; category?: TransactionCategory | null; amountCents; occurredOn; description: string | null; createdAt; updatedAt }`.
- `StatementItem = Transaction & { balanceCents: number }`.
- `AccountingStatement { openingBalanceCents; totals: { incomeCents; expenseCents; netCents }; items: StatementItem[] }`.
- `MonthlyAccountingSummary { month: string; incomeCents: number; expenseCents: number }`.
- Request types: `CreateTransactionRequest`, `UpdateTransactionRequest`, `CreateTransactionCategoryRequest`, `UpdateTransactionCategoryRequest`.

Build with `pnpm --filter @nutri-plus/shared-types build`.

## 5. Access & money

- Both `NUTRITIONIST` and `EMPLOYEE` have full CRUD on transactions and
  categories; everything is scoped to the nutritionist via
  `resolveScopeNutritionistId` (never cross-scope).
- All amounts are integer cents in the DB, API, and shared-types; the web
  formats to `R$ 1.234,56` and parses the R$ input back to cents.
- Income = green, expense = red — semantic colors, distinct from the brand
  accent (teal).

## 6. Testing

- **API (jest, `pnpm --filter @nutri-plus/api test`):** category CRUD own-scope +
  `type` filter; transaction create rejects a category whose `type` mismatches or
  is out of scope; statement opening balance + per-row running balance + period
  totals; monthly-summary aggregation (12 months, zero-filled, correct
  income/expense split); CRUD own-scope only.
- **Web (vitest + RTL, `pnpm --filter @nutri-plus/web test`):** transaction form
  submits cents (BRL parse) + filters categories by type; statement table renders
  signed/colored amounts + running balance; summary cards compute from the
  statement; chart maps monthly summary to bars; category CRUD.
- **shared-types:** `pnpm --filter @nutri-plus/shared-types build` clean.

## 7. Global constraints

- SINGLE quotes in new files; pt-BR user copy.
- Follow existing module patterns (`appointments` / `appointment-categories` on
  the API; `lib/api` + `lib/queries` + `(app)/*` pages on the web; recharts for
  charts).
- Money as integer cents everywhere; BRL formatting only in the presentation
  layer.
- Additive migration on the shared dev DB (`prisma migrate dev`); never commit
  `.env`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do not push/PR unless asked.
- Verify: API `pnpm --filter @nutri-plus/api test`; web `pnpm --filter
  @nutri-plus/web test`; shared-types `pnpm --filter @nutri-plus/shared-types
  build`. Keep existing suites green.
