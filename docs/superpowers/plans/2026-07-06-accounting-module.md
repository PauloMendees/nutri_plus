# Contabilidade (Accounting) Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web Contabilidade module — income/expense transactions with typed managed categories, a bank-statement extrato (opening + running balance + period totals), and a monthly income-vs-expense bar chart.

**Architecture:** New Prisma models (`Transaction`, `TransactionCategory`, `TransactionType`) owned by `NutritionistProfile`; two API modules (`transaction-categories`, `transactions`) mirroring `appointment-categories`/`appointments`, both `@Roles(NUTRITIONIST, EMPLOYEE)` and scoped via `resolveScopeNutritionistId`; shared-types contract; a web module under `(app)/contabilidade` (Extrato + Categorias) using the existing `lib/api`+`lib/queries` data layer, react-hook-form/zod dialogs, and recharts.

**Tech Stack:** NestJS + Prisma (pg) / Next.js 16 + React Query + react-hook-form + zod + recharts + shadcn ui / `@nutri-plus/shared-types`.

## Global Constraints

- SINGLE quotes in new files; pt-BR user copy.
- Money is **integer cents** everywhere (DB, API, shared-types); BRL formatting only in the web presentation layer. `amountCents` is always positive; direction comes from `type`.
- Both `NUTRITIONIST` and `EMPLOYEE` get full CRUD; every query is scoped with `resolveScopeNutritionistId(ctx)` (cross-scope id → 404 / `NotFoundException`).
- Follow existing patterns: API `appointments`/`appointment-categories`; web `lib/api/*` + `lib/queries/*` + `(app)/*` pages + `components/*` views/dialogs; recharts for charts (see `components/patients/bioimpedance-section.tsx`).
- Additive Prisma migration on the shared dev DB (`pnpm --filter @nutri-plus/api exec prisma migrate dev --name accounting`); never commit `.env`.
- Statement `to` is **exclusive** (`occurredOn >= from AND occurredOn < to`), matching the appointments `to` convention.
- Income = green, expense = red (semantic, distinct from the teal brand accent).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do not push/PR unless asked.
- Verify per task: API `pnpm --filter @nutri-plus/api test`; web `pnpm --filter @nutri-plus/web test`; shared-types `pnpm --filter @nutri-plus/shared-types build`. Keep existing suites green.

---

## File Structure

**Prisma / shared-types**
- Modify `apps/api/prisma/schema.prisma` — `TransactionType`, `TransactionCategory`, `Transaction` + `NutritionistProfile` back-relations. (Task 1)
- Create `packages/shared-types/src/v1/accounting.ts`; export from `v1/index.ts`. (Task 2)

**API**
- Create `apps/api/src/transaction-categories/{transaction-categories.controller,service,module}.ts`, `dto/{create,update}-transaction-category.dto.ts`, `transaction-categories.service.spec.ts`. (Task 3)
- Create `apps/api/src/transactions/{transactions.controller,service,module}.ts`, `dto/{create-transaction,update-transaction,statement-query,monthly-summary-query}.dto.ts`, `transactions.service.spec.ts`. (Tasks 4–5)
- Modify `apps/api/src/app.module.ts` — register both modules. (Task 3)

**Web**
- Create `apps/web/src/lib/format/currency.ts` (+ `.test.ts`), `lib/api/{transactions,transaction-categories}.ts`, `lib/queries/{transactions,transaction-categories}.ts`, `lib/validation/{transaction,transaction-category}.ts`. (Task 6)
- Modify `apps/web/src/components/app/nav-items.ts` — add Contabilidade. (Task 8)
- Create `apps/web/src/app/(app)/contabilidade/{page.tsx, categorias/page.tsx}`. (Tasks 7–9)
- Create `apps/web/src/components/accounting/{transaction-categories-view,transaction-category-dialog,transaction-dialog,accounting-view,statement-table,summary-cards,monthly-chart}.tsx` (+ focused tests). (Tasks 7–10)

Build order: Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10.

---

## Task 1: Prisma models + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: prisma models `TransactionType` (enum `INCOME`/`EXPENSE`), `TransactionCategory`, `Transaction`, and their `NutritionistProfile` back-relations; generated client delegates `prisma.transaction` + `prisma.transactionCategory`.

This is a schema/migration task — verified by a clean migration + `prisma generate` + the API still building, not a unit test.

- [ ] **Step 1: Add the enum + models to the schema**

Append to `apps/api/prisma/schema.prisma` (after the existing enums / models; place the enum near the other enums):

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

  transactions Transaction[]

  @@index([nutritionistId, type])
}

model Transaction {
  id             String               @id @default(uuid())
  nutritionistId String
  nutritionist   NutritionistProfile  @relation(fields: [nutritionistId], references: [id])
  type           TransactionType
  categoryId     String?
  category       TransactionCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  amountCents    Int
  occurredOn     DateTime
  description    String?
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt

  @@index([nutritionistId, occurredOn])
}
```

- [ ] **Step 2: Add the back-relations to `NutritionistProfile`**

In `model NutritionistProfile`, alongside the existing `appointments`/`appointmentCategories` relation fields, add:

```prisma
  transactions          Transaction[]
  transactionCategories TransactionCategory[]
```

- [ ] **Step 3: Create + apply the migration**

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name accounting`
Expected: a new migration under `apps/api/prisma/migrations/*_accounting/` applies cleanly; the client regenerates.

- [ ] **Step 4: Verify the client compiles**

Run: `pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: no errors (the generated client now exposes `TransactionType`, `prisma.transaction`, `prisma.transactionCategory`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): Transaction + TransactionCategory models (accounting)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: shared-types accounting contract

**Files:**
- Create: `packages/shared-types/src/v1/accounting.ts`
- Modify: `packages/shared-types/src/v1/index.ts`

**Interfaces:**
- Produces: `TransactionType`, `TransactionCategory`, `Transaction`, `StatementItem`, `AccountingStatement`, `MonthlyAccountingSummary`, `CreateTransactionRequest`, `UpdateTransactionRequest`, `CreateTransactionCategoryRequest`, `UpdateTransactionCategoryRequest`.

Types-only build artifact; verification is a clean build.

- [ ] **Step 1: Create `accounting.ts`**

```ts
export type TransactionType = 'INCOME' | 'EXPENSE';

export interface TransactionCategory {
  id: string;
  name: string;
  type: TransactionType;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  categoryId: string | null;
  category: TransactionCategory | null;
  amountCents: number;
  occurredOn: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

// A statement row: a transaction plus the running account balance after it.
export type StatementItem = Transaction & { balanceCents: number };

export interface AccountingStatement {
  openingBalanceCents: number;
  totals: { incomeCents: number; expenseCents: number; netCents: number };
  items: StatementItem[];
}

export interface MonthlyAccountingSummary {
  month: string; // 'YYYY-MM'
  incomeCents: number;
  expenseCents: number;
}

export interface CreateTransactionRequest {
  type: TransactionType;
  amountCents: number;
  occurredOn: string;
  categoryId?: string | null;
  description?: string | null;
}

export type UpdateTransactionRequest = Partial<CreateTransactionRequest>;

export interface CreateTransactionCategoryRequest {
  name: string;
  type: TransactionType;
}

export type UpdateTransactionCategoryRequest = Partial<CreateTransactionCategoryRequest>;
```

- [ ] **Step 2: Export from the v1 barrel**

Add to `packages/shared-types/src/v1/index.ts`:

```ts
export * from './accounting';
```

- [ ] **Step 3: Build**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: clean build; the new types are importable from `@nutri-plus/shared-types`.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/v1/accounting.ts packages/shared-types/src/v1/index.ts
git commit -m "feat(shared-types): accounting transaction + statement contract

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: API — `transaction-categories` module

Managed typed categories, full CRUD, scoped. Mirrors `appointment-categories` (minus color/isDefault; plus `type`).

**Files:**
- Create: `apps/api/src/transaction-categories/transaction-categories.controller.ts`
- Create: `apps/api/src/transaction-categories/transaction-categories.service.ts`
- Create: `apps/api/src/transaction-categories/transaction-categories.module.ts`
- Create: `apps/api/src/transaction-categories/dto/create-transaction-category.dto.ts`
- Create: `apps/api/src/transaction-categories/dto/update-transaction-category.dto.ts`
- Create: `apps/api/src/transaction-categories/transaction-categories.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `resolveScopeNutritionistId`, `AuthContext`, `PrismaService`, `TransactionType` (generated client).
- Produces: `TransactionCategoriesService` with `create/list/getOne/update/remove(ctx, ...)`; `GET/POST/PATCH/DELETE /v1/transaction-categories`; `GET` supports `?type=INCOME|EXPENSE`.

- [ ] **Step 1: Write the failing service spec**

`apps/api/src/transaction-categories/transaction-categories.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { TransactionCategoriesService } from './transaction-categories.service';

const CTX = { user: { role: 'NUTRITIONIST', nutritionistProfile: { id: 'nut-1' } } } as never;

function makePrisma() {
  const transactionCategory = {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const prisma: any = { transactionCategory };
  return { prisma, transactionCategory };
}

describe('TransactionCategoriesService', () => {
  it('creates a category scoped to the nutritionist', async () => {
    const { prisma, transactionCategory } = makePrisma();
    transactionCategory.create.mockResolvedValue({ id: 'c1' });
    const service = new TransactionCategoriesService(prisma as never);

    await service.create(CTX, { name: 'Consultas', type: 'INCOME' });

    expect(transactionCategory.create).toHaveBeenCalledWith({
      data: { nutritionistId: 'nut-1', name: 'Consultas', type: 'INCOME' },
    });
  });

  it('lists the scope categories, optionally filtered by type, ordered by name', async () => {
    const { prisma, transactionCategory } = makePrisma();
    transactionCategory.findMany.mockResolvedValue([]);
    const service = new TransactionCategoriesService(prisma as never);

    await service.list(CTX, 'EXPENSE');

    expect(transactionCategory.findMany).toHaveBeenCalledWith({
      where: { nutritionistId: 'nut-1', type: 'EXPENSE' },
      orderBy: { name: 'asc' },
    });
  });

  it('throws NotFound when updating a category outside the scope', async () => {
    const { prisma, transactionCategory } = makePrisma();
    transactionCategory.findFirst.mockResolvedValue(null);
    const service = new TransactionCategoriesService(prisma as never);

    await expect(service.update(CTX, 'x', { name: 'y' })).rejects.toBeInstanceOf(NotFoundException);
    expect(transactionCategory.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify RED**

Run: `pnpm --filter @nutri-plus/api test -- transaction-categories.service.spec`
Expected: FAIL — module not found.

- [ ] **Step 3: DTOs**

`dto/create-transaction-category.dto.ts`:

```ts
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { TransactionType } from '../../generated/prisma/client';

export class CreateTransactionCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsEnum(TransactionType)
  type!: TransactionType;
}
```

`dto/update-transaction-category.dto.ts`:

```ts
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TransactionType } from '../../generated/prisma/client';

export class UpdateTransactionCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;
}
```

- [ ] **Step 4: Service**

`transaction-categories.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { TransactionType } from '../generated/prisma/client';
import { CreateTransactionCategoryDto } from './dto/create-transaction-category.dto';
import { UpdateTransactionCategoryDto } from './dto/update-transaction-category.dto';

@Injectable()
export class TransactionCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: AuthContext, dto: CreateTransactionCategoryDto) {
    return this.prisma.transactionCategory.create({
      data: {
        nutritionistId: resolveScopeNutritionistId(ctx),
        name: dto.name,
        type: dto.type,
      },
    });
  }

  async list(ctx: AuthContext, type?: TransactionType) {
    return this.prisma.transactionCategory.findMany({
      where: { nutritionistId: resolveScopeNutritionistId(ctx), ...(type ? { type } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  async getOne(ctx: AuthContext, id: string) {
    const category = await this.prisma.transactionCategory.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
    });
    if (!category) {
      throw new NotFoundException('Transaction category not found');
    }
    return category;
  }

  async update(ctx: AuthContext, id: string, dto: UpdateTransactionCategoryDto) {
    const existing = await this.prisma.transactionCategory.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Transaction category not found');
    }
    return this.prisma.transactionCategory.update({
      where: { id },
      data: { name: dto.name, type: dto.type },
    });
  }

  async remove(ctx: AuthContext, id: string): Promise<void> {
    const existing = await this.prisma.transactionCategory.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Transaction category not found');
    }
    await this.prisma.transactionCategory.delete({ where: { id } });
  }
}
```

- [ ] **Step 5: Controller**

`transaction-categories.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TransactionType, UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { TransactionCategoriesService } from './transaction-categories.service';
import { CreateTransactionCategoryDto } from './dto/create-transaction-category.dto';
import { UpdateTransactionCategoryDto } from './dto/update-transaction-category.dto';

@ApiTags('transaction-categories')
@ApiBearerAuth()
@Controller({ path: 'transaction-categories', version: '1' })
@Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
export class TransactionCategoriesController {
  constructor(private readonly categories: TransactionCategoriesService) {}

  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreateTransactionCategoryDto) {
    return this.categories.create(ctx, dto);
  }

  @Get()
  list(@CurrentUser() ctx: AuthContext, @Query('type') type?: TransactionType) {
    return this.categories.list(ctx, type);
  }

  @Get(':id')
  findOne(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.getOne(ctx, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionCategoryDto,
  ) {
    return this.categories.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(ctx, id);
  }
}
```

Note: `@Query('type')` is validated at the service/consumer layer; an invalid value simply yields no matching rows. (The global ValidationPipe does not coerce a bare `@Query('type')` string param — that's acceptable here.)

- [ ] **Step 6: Module + register in AppModule**

`transaction-categories.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TransactionCategoriesController } from './transaction-categories.controller';
import { TransactionCategoriesService } from './transaction-categories.service';

@Module({
  controllers: [TransactionCategoriesController],
  providers: [TransactionCategoriesService],
})
export class TransactionCategoriesModule {}
```

In `apps/api/src/app.module.ts`, add the import + register it in `imports`:

```ts
import { TransactionCategoriesModule } from './transaction-categories/transaction-categories.module';
```

Add `TransactionCategoriesModule,` to the `imports: [...]` array (next to `AppointmentCategoriesModule`).

- [ ] **Step 7: Run tests + full API suite**

Run: `pnpm --filter @nutri-plus/api test -- transaction-categories.service.spec`
Expected: PASS (3 cases).

Run: `pnpm --filter @nutri-plus/api test`
Expected: full suite green.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/transaction-categories apps/api/src/app.module.ts
git commit -m "feat(api): transaction-categories CRUD (typed, scoped)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: API — `transactions` CRUD

Create/read/update/delete transactions, scoped, with category type-match validation. (Statement + summary are Task 5, same module.)

**Files:**
- Create: `apps/api/src/transactions/transactions.service.ts`
- Create: `apps/api/src/transactions/transactions.controller.ts`
- Create: `apps/api/src/transactions/transactions.module.ts`
- Create: `apps/api/src/transactions/dto/create-transaction.dto.ts`
- Create: `apps/api/src/transactions/dto/update-transaction.dto.ts`
- Create: `apps/api/src/transactions/transactions.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `resolveScopeNutritionistId`, `AuthContext`, `PrismaService`, `TransactionType`.
- Produces: `TransactionsService` with `create/getOne/update/remove` (and, in Task 5, `getStatement/getMonthlySummary`); `POST/GET :id/PATCH :id/DELETE :id /v1/transactions`. All reads/writes `include: { category: true }`.

- [ ] **Step 1: Write the failing spec**

`apps/api/src/transactions/transactions.service.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

const CTX = { user: { role: 'NUTRITIONIST', nutritionistProfile: { id: 'nut-1' } } } as never;

function makePrisma() {
  const transaction = {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const transactionCategory = { findFirst: jest.fn() };
  const prisma: any = { transaction, transactionCategory };
  return { prisma, transaction, transactionCategory };
}

const CREATE = {
  type: 'EXPENSE' as const,
  amountCents: 5000,
  occurredOn: new Date('2026-07-03'),
  categoryId: 'cat-1',
  description: 'Aluguel',
};

describe('TransactionsService CRUD', () => {
  it('creates a transaction scoped to the nutritionist, including the category', async () => {
    const { prisma, transaction, transactionCategory } = makePrisma();
    transactionCategory.findFirst.mockResolvedValue({ id: 'cat-1', type: 'EXPENSE' });
    transaction.create.mockResolvedValue({ id: 't1' });
    const service = new TransactionsService(prisma as never);

    await service.create(CTX, CREATE);

    expect(transaction.create).toHaveBeenCalledWith({
      data: {
        nutritionistId: 'nut-1',
        type: 'EXPENSE',
        amountCents: 5000,
        occurredOn: CREATE.occurredOn,
        categoryId: 'cat-1',
        description: 'Aluguel',
      },
      include: { category: true },
    });
  });

  it('rejects a category whose type does not match the transaction type', async () => {
    const { prisma, transaction, transactionCategory } = makePrisma();
    transactionCategory.findFirst.mockResolvedValue({ id: 'cat-1', type: 'INCOME' });
    const service = new TransactionsService(prisma as never);

    await expect(service.create(CTX, CREATE)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.create).not.toHaveBeenCalled();
  });

  it('rejects a category outside the scope', async () => {
    const { prisma, transaction, transactionCategory } = makePrisma();
    transactionCategory.findFirst.mockResolvedValue(null);
    const service = new TransactionsService(prisma as never);

    await expect(service.create(CTX, CREATE)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.create).not.toHaveBeenCalled();
  });

  it('removes only an owned transaction', async () => {
    const { prisma, transaction } = makePrisma();
    transaction.findFirst.mockResolvedValue(null);
    const service = new TransactionsService(prisma as never);

    await expect(service.remove(CTX, 't1')).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify RED**

Run: `pnpm --filter @nutri-plus/api test -- transactions.service.spec`
Expected: FAIL — module not found.

- [ ] **Step 3: DTOs**

`dto/create-transaction.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TransactionType } from '../../generated/prisma/client';

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  type!: TransactionType;

  @IsInt()
  @IsPositive()
  amountCents!: number;

  @Type(() => Date)
  @IsDate()
  occurredOn!: Date;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
```

`dto/update-transaction.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TransactionType } from '../../generated/prisma/client';

export class UpdateTransactionDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsInt()
  @IsPositive()
  amountCents?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  occurredOn?: Date;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
```

- [ ] **Step 4: Service (CRUD only)**

`transactions.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { TransactionType } from '../generated/prisma/client';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

const TRANSACTION_INCLUDE = { category: true } as const;

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: AuthContext, dto: CreateTransactionDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    if (dto.categoryId) {
      await this.assertCategoryMatches(nutritionistId, dto.categoryId, dto.type);
    }
    return this.prisma.transaction.create({
      data: {
        nutritionistId,
        type: dto.type,
        amountCents: dto.amountCents,
        occurredOn: dto.occurredOn,
        categoryId: dto.categoryId ?? null,
        description: dto.description ?? null,
      },
      include: TRANSACTION_INCLUDE,
    });
  }

  async getOne(ctx: AuthContext, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      include: TRANSACTION_INCLUDE,
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async update(ctx: AuthContext, id: string, dto: UpdateTransactionDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const existing = await this.prisma.transaction.findFirst({
      where: { id, nutritionistId },
    });
    if (!existing) {
      throw new NotFoundException('Transaction not found');
    }
    // The category (if set) must match the resulting transaction type.
    const nextType = dto.type ?? existing.type;
    if (dto.categoryId) {
      await this.assertCategoryMatches(nutritionistId, dto.categoryId, nextType);
    }
    return this.prisma.transaction.update({
      where: { id },
      data: {
        type: dto.type,
        amountCents: dto.amountCents,
        occurredOn: dto.occurredOn,
        categoryId: dto.categoryId,
        description: dto.description,
      },
      include: TRANSACTION_INCLUDE,
    });
  }

  async remove(ctx: AuthContext, id: string): Promise<void> {
    const existing = await this.prisma.transaction.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Transaction not found');
    }
    await this.prisma.transaction.delete({ where: { id } });
  }

  // The category must belong to the scope and share the transaction's type.
  private async assertCategoryMatches(
    nutritionistId: string,
    categoryId: string,
    type: TransactionType,
  ): Promise<void> {
    const category = await this.prisma.transactionCategory.findFirst({
      where: { id: categoryId, nutritionistId },
      select: { type: true },
    });
    if (!category || category.type !== type) {
      throw new BadRequestException('Invalid category for this transaction type');
    }
  }
}
```

- [ ] **Step 5: Controller (CRUD only for now) + module + register**

`transactions.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@ApiTags('transactions')
@ApiBearerAuth()
@Controller({ path: 'transactions', version: '1' })
@Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreateTransactionDto) {
    return this.transactions.create(ctx, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactions.getOne(ctx, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactions.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactions.remove(ctx, id);
  }
}
```

`transactions.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
```

In `apps/api/src/app.module.ts`, add:

```ts
import { TransactionsModule } from './transactions/transactions.module';
```

and `TransactionsModule,` in the `imports` array.

- [ ] **Step 6: Run tests + full API suite**

Run: `pnpm --filter @nutri-plus/api test -- transactions.service.spec`
Expected: PASS (4 cases).

Run: `pnpm --filter @nutri-plus/api test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/transactions apps/api/src/app.module.ts
git commit -m "feat(api): transactions CRUD with category type-match (accounting)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: API — statement + monthly summary

Add the two read endpoints to the `transactions` module: the bank-statement extrato (opening + running balance + totals) and the monthly income/expense aggregation.

**Files:**
- Modify: `apps/api/src/transactions/transactions.service.ts`
- Modify: `apps/api/src/transactions/transactions.controller.ts`
- Create: `apps/api/src/transactions/dto/statement-query.dto.ts`
- Create: `apps/api/src/transactions/dto/monthly-summary-query.dto.ts`
- Modify: `apps/api/src/transactions/transactions.service.spec.ts`

**Interfaces:**
- Produces: `getStatement(ctx, { from, to }) → { openingBalanceCents, totals, items: (tx & { balanceCents })[] }` and `getMonthlySummary(ctx, { months }) → { month, incomeCents, expenseCents }[]`; `GET /v1/transactions/statement?from&to`, `GET /v1/transactions/monthly-summary?months`.

- [ ] **Step 1: Add the failing spec cases**

Append to `transactions.service.spec.ts`:

```ts
describe('TransactionsService statement', () => {
  const CTX2 = { user: { role: 'NUTRITIONIST', nutritionistProfile: { id: 'nut-1' } } } as never;

  it('computes opening balance, per-row running balance (newest-first), and totals', async () => {
    const { prisma, transaction } = makePrisma();
    // before `from`: +100 income → opening balance 100
    transaction.findMany
      .mockResolvedValueOnce([{ type: 'INCOME', amountCents: 100 }]) // opening query
      .mockResolvedValueOnce([
        { id: 'a', type: 'INCOME', amountCents: 500, occurredOn: new Date('2026-07-02'), category: null },
        { id: 'b', type: 'EXPENSE', amountCents: 200, occurredOn: new Date('2026-07-05'), category: null },
      ]); // period query (ascending)
    const service = new TransactionsService(prisma as never);

    const result = await service.getStatement(CTX2, {
      from: new Date('2026-07-01'),
      to: new Date('2026-08-01'),
    });

    expect(result.openingBalanceCents).toBe(100);
    expect(result.totals).toEqual({ incomeCents: 500, expenseCents: 200, netCents: 300 });
    // newest-first: b (balance 100+500-200=400), then a (100+500=600)
    expect(result.items.map((i) => [i.id, i.balanceCents])).toEqual([
      ['b', 400],
      ['a', 600],
    ]);
  });
});

describe('TransactionsService monthly summary', () => {
  const CTX2 = { user: { role: 'NUTRITIONIST', nutritionistProfile: { id: 'nut-1' } } } as never;

  it('buckets income/expense by month and zero-fills the range', async () => {
    const { prisma, transaction } = makePrisma();
    transaction.findMany.mockResolvedValue([
      { type: 'INCOME', amountCents: 300, occurredOn: new Date('2026-07-10') },
      { type: 'EXPENSE', amountCents: 120, occurredOn: new Date('2026-07-20') },
    ]);
    const service = new TransactionsService(prisma as never);

    const result = await service.getMonthlySummary(CTX2, { months: 3 });

    expect(result).toHaveLength(3);
    const july = result.find((m) => m.month === '2026-07');
    expect(july).toEqual({ month: '2026-07', incomeCents: 300, expenseCents: 120 });
    // every bucket present, even zero months
    expect(result.every((m) => typeof m.incomeCents === 'number')).toBe(true);
  });
});
```

Note: the monthly test seeds July data; keep the test machine-clock-independent by asserting the July bucket + shape (not exact month keys for “now”).

- [ ] **Step 2: Run it to verify RED**

Run: `pnpm --filter @nutri-plus/api test -- transactions.service.spec`
Expected: FAIL — `getStatement`/`getMonthlySummary` not functions.

- [ ] **Step 3: Query DTOs**

`dto/statement-query.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';

export class StatementQueryDto {
  @Type(() => Date)
  @IsDate()
  from!: Date;

  @Type(() => Date)
  @IsDate()
  to!: Date;
}
```

`dto/monthly-summary-query.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class MonthlySummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number;
}
```

- [ ] **Step 4: Add the service methods**

In `transactions.service.ts`, add the imports and methods. First extend the type import and add a signed-amount helper + a month-key helper:

```ts
import { TransactionType } from '../generated/prisma/client';
```
(already imported — no change) and add, inside the class:

```ts
  async getStatement(ctx: AuthContext, params: { from: Date; to: Date }) {
    const nutritionistId = resolveScopeNutritionistId(ctx);

    const before = await this.prisma.transaction.findMany({
      where: { nutritionistId, occurredOn: { lt: params.from } },
      select: { type: true, amountCents: true },
    });
    const openingBalanceCents = before.reduce((sum, t) => sum + signed(t), 0);

    const periodAsc = await this.prisma.transaction.findMany({
      where: { nutritionistId, occurredOn: { gte: params.from, lt: params.to } },
      orderBy: [{ occurredOn: 'asc' }, { createdAt: 'asc' }],
      include: TRANSACTION_INCLUDE,
    });

    let running = openingBalanceCents;
    let incomeCents = 0;
    let expenseCents = 0;
    const withBalanceAsc = periodAsc.map((t) => {
      running += signed(t);
      if (t.type === 'INCOME') incomeCents += t.amountCents;
      else expenseCents += t.amountCents;
      return { ...t, balanceCents: running };
    });

    return {
      openingBalanceCents,
      totals: { incomeCents, expenseCents, netCents: incomeCents - expenseCents },
      items: withBalanceAsc.reverse(), // newest-first for display
    };
  }

  async getMonthlySummary(ctx: AuthContext, params: { months?: number }) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const months = params.months ?? 12;
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

    const rows = await this.prisma.transaction.findMany({
      where: { nutritionistId, occurredOn: { gte: start } },
      select: { type: true, amountCents: true, occurredOn: true },
    });

    const buckets = new Map<string, { incomeCents: number; expenseCents: number }>();
    for (let i = 0; i < months; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      buckets.set(monthKey(d), { incomeCents: 0, expenseCents: 0 });
    }
    for (const r of rows) {
      const bucket = buckets.get(monthKey(r.occurredOn));
      if (!bucket) continue;
      if (r.type === 'INCOME') bucket.incomeCents += r.amountCents;
      else bucket.expenseCents += r.amountCents;
    }
    return [...buckets.entries()].map(([month, v]) => ({ month, ...v }));
  }
```

And add these module-scope helpers at the bottom of the file (after the class):

```ts
function signed(t: { type: TransactionType; amountCents: number }): number {
  return t.type === 'INCOME' ? t.amountCents : -t.amountCents;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
```

- [ ] **Step 5: Add the controller routes**

In `transactions.controller.ts`, add imports + routes. Add `Query` to the `@nestjs/common` import, and:

```ts
import { StatementQueryDto } from './dto/statement-query.dto';
import { MonthlySummaryQueryDto } from './dto/monthly-summary-query.dto';
```

Add these methods **above** `findOne` (so `/statement` and `/monthly-summary` are matched before the `:id` route):

```ts
  @Get('statement')
  statement(@CurrentUser() ctx: AuthContext, @Query() query: StatementQueryDto) {
    return this.transactions.getStatement(ctx, query);
  }

  @Get('monthly-summary')
  monthlySummary(@CurrentUser() ctx: AuthContext, @Query() query: MonthlySummaryQueryDto) {
    return this.transactions.getMonthlySummary(ctx, query);
  }
```

(Ordering matters: NestJS matches routes in declaration order, and `@Get(':id')` with `ParseUUIDPipe` would otherwise reject `statement`/`monthly-summary`.)

- [ ] **Step 6: Run tests + full API suite**

Run: `pnpm --filter @nutri-plus/api test -- transactions.service.spec`
Expected: PASS (CRUD + statement + summary).

Run: `pnpm --filter @nutri-plus/api test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/transactions
git commit -m "feat(api): statement (opening + running balance) + monthly summary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Web — currency util + data layer + validation

**Files:**
- Create: `apps/web/src/lib/format/currency.ts`
- Create: `apps/web/src/lib/format/currency.test.ts`
- Create: `apps/web/src/lib/api/transaction-categories.ts`
- Create: `apps/web/src/lib/api/transactions.ts`
- Create: `apps/web/src/lib/queries/transaction-categories.ts`
- Create: `apps/web/src/lib/queries/transactions.ts`
- Create: `apps/web/src/lib/validation/transaction-category.ts`
- Create: `apps/web/src/lib/validation/transaction.ts`

**Interfaces:**
- Produces: `formatBRL(cents: number): string`, `parseBRLToCents(input: string): number`; the api fns + react-query hooks used by the web components; zod form schemas `transactionCategoryFormSchema` / `transactionFormSchema`.

- [ ] **Step 1: Write the failing currency test**

`apps/web/src/lib/format/currency.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatBRL, parseBRLToCents } from './currency';

const norm = (s: string) => s.replace(/\s/g, ' ');

describe('formatBRL', () => {
  it('formats cents as pt-BR BRL', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(0)).toBe('R$ 0,00');
    expect(formatBRL(-500)).toBe('-R$ 5,00');
  });
});

describe('parseBRLToCents', () => {
  it('parses pt-BR amounts to integer cents', () => {
    expect(parseBRLToCents('1.234,56')).toBe(123456);
    expect(parseBRLToCents('R$ 10,00')).toBe(1000);
    expect(parseBRLToCents('10')).toBe(1000);
    expect(parseBRLToCents('10,5')).toBe(1050);
  });

  it('returns NaN for empty/invalid input', () => {
    expect(Number.isNaN(parseBRLToCents(''))).toBe(true);
    expect(Number.isNaN(parseBRLToCents('abc'))).toBe(true);
  });
});
```

Note: `Intl` inserts a non-breaking space (` `) between `R$` and the number — the test asserts that exact character.

- [ ] **Step 2: Run it to verify RED**

Run: `pnpm --filter @nutri-plus/web test -- currency`
Expected: FAIL — `./currency` not found.

- [ ] **Step 3: Implement `currency.ts`**

```ts
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// cents (integer) → 'R$ 1.234,56'. Negative cents render with a leading '-'.
export function formatBRL(cents: number): string {
  return BRL.format(cents / 100);
}

// 'R$ 1.234,56' | '1234,56' | '10' → integer cents. NaN when there is no number.
export function parseBRLToCents(input: string): number {
  const cleaned = input
    .replace(/[^\d,.-]/g, '') // drop currency symbol, spaces, letters
    .replace(/\.(?=\d{3}(\D|$))/g, '') // drop thousands dots
    .replace(',', '.'); // decimal comma → dot
  if (cleaned === '' || cleaned === '-') return Number.NaN;
  const reais = Number(cleaned);
  if (Number.isNaN(reais)) return Number.NaN;
  return Math.round(reais * 100);
}
```

- [ ] **Step 4: Run it to verify GREEN**

Run: `pnpm --filter @nutri-plus/web test -- currency`
Expected: PASS.

- [ ] **Step 5: API fns**

`lib/api/transaction-categories.ts`:

```ts
import type {
  CreateTransactionCategoryRequest,
  TransactionCategory,
  TransactionType,
  UpdateTransactionCategoryRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listTransactionCategories(type?: TransactionType): Promise<TransactionCategory[]> {
  const q = type ? `?type=${type}` : '';
  return browserApiFetch<TransactionCategory[]>(`/transaction-categories${q}`);
}

export function createTransactionCategory(
  body: CreateTransactionCategoryRequest,
): Promise<TransactionCategory> {
  return browserApiFetch<TransactionCategory>('/transaction-categories', { method: 'POST', body });
}

export function updateTransactionCategory(
  id: string,
  body: UpdateTransactionCategoryRequest,
): Promise<TransactionCategory> {
  return browserApiFetch<TransactionCategory>(`/transaction-categories/${id}`, {
    method: 'PATCH',
    body,
  });
}

export function deleteTransactionCategory(id: string): Promise<void> {
  return browserApiFetch<void>(`/transaction-categories/${id}`, { method: 'DELETE' });
}
```

`lib/api/transactions.ts`:

```ts
import type {
  AccountingStatement,
  CreateTransactionRequest,
  MonthlyAccountingSummary,
  Transaction,
  UpdateTransactionRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function getStatement(fromISO: string, toISO: string): Promise<AccountingStatement> {
  return browserApiFetch<AccountingStatement>(
    `/transactions/statement?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`,
  );
}

export function getMonthlySummary(months = 12): Promise<MonthlyAccountingSummary[]> {
  return browserApiFetch<MonthlyAccountingSummary[]>(`/transactions/monthly-summary?months=${months}`);
}

export function createTransaction(body: CreateTransactionRequest): Promise<Transaction> {
  return browserApiFetch<Transaction>('/transactions', { method: 'POST', body });
}

export function updateTransaction(id: string, body: UpdateTransactionRequest): Promise<Transaction> {
  return browserApiFetch<Transaction>(`/transactions/${id}`, { method: 'PATCH', body });
}

export function deleteTransaction(id: string): Promise<void> {
  return browserApiFetch<void>(`/transactions/${id}`, { method: 'DELETE' });
}
```

- [ ] **Step 6: React-query hooks**

`lib/queries/transaction-categories.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTransactionCategoryRequest,
  TransactionType,
  UpdateTransactionCategoryRequest,
} from '@nutri-plus/shared-types';
import {
  createTransactionCategory,
  deleteTransactionCategory,
  listTransactionCategories,
  updateTransactionCategory,
} from '@/lib/api/transaction-categories';

export function useTransactionCategories(type?: TransactionType) {
  return useQuery({
    queryKey: ['transaction-categories', type ?? 'all'],
    queryFn: () => listTransactionCategories(type),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['transaction-categories'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  };
}

export function useCreateTransactionCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateTransactionCategoryRequest) => createTransactionCategory(body),
    onSuccess: invalidate,
  });
}

export function useUpdateTransactionCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTransactionCategoryRequest }) =>
      updateTransactionCategory(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteTransactionCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deleteTransactionCategory(id),
    onSuccess: invalidate,
  });
}
```

`lib/queries/transactions.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTransactionRequest,
  UpdateTransactionRequest,
} from '@nutri-plus/shared-types';
import {
  createTransaction,
  deleteTransaction,
  getMonthlySummary,
  getStatement,
  updateTransaction,
} from '@/lib/api/transactions';

export function useStatement(fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ['transactions', 'statement', fromISO, toISO],
    queryFn: () => getStatement(fromISO, toISO),
  });
}

export function useMonthlySummary(months = 12) {
  return useQuery({
    queryKey: ['transactions', 'monthly-summary', months],
    queryFn: () => getMonthlySummary(months),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['transactions'] });
}

export function useCreateTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateTransactionRequest) => createTransaction(body),
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTransactionRequest }) =>
      updateTransaction(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 7: Validation schemas**

`lib/validation/transaction-category.ts`:

```ts
import { z } from 'zod';

export const transactionCategoryFormSchema = z.object({
  name: z.string().trim().min(1, 'Informe um nome.').max(80),
  type: z.enum(['INCOME', 'EXPENSE']),
});

export type TransactionCategoryFormValues = z.infer<typeof transactionCategoryFormSchema>;
```

`lib/validation/transaction.ts`:

```ts
import { z } from 'zod';
import { parseBRLToCents } from '@/lib/format/currency';

export const transactionFormSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  // amount is entered as a pt-BR string; must parse to a positive value.
  amount: z
    .string()
    .trim()
    .min(1, 'Informe um valor.')
    .refine((v) => parseBRLToCents(v) > 0, 'Valor inválido.'),
  occurredOn: z.string().min(1, 'Informe a data.'), // 'YYYY-MM-DD' from <input type="date">
  categoryId: z.string().nullable().optional(),
  description: z.string().max(500).optional(),
});

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;
```

- [ ] **Step 8: Run tests + type check**

Run: `pnpm --filter @nutri-plus/web test -- currency`
Expected: PASS.

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: no errors (needs the shared-types build from Task 2).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/format apps/web/src/lib/api/transaction-categories.ts apps/web/src/lib/api/transactions.ts apps/web/src/lib/queries/transaction-categories.ts apps/web/src/lib/queries/transactions.ts apps/web/src/lib/validation/transaction-category.ts apps/web/src/lib/validation/transaction.ts
git commit -m "feat(web): accounting data layer + BRL currency util + form schemas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Web — Categorias (page + view + dialog)

Typed-category CRUD, mirroring `agenda/categorias`.

**Files:**
- Create: `apps/web/src/app/(app)/contabilidade/categorias/page.tsx`
- Create: `apps/web/src/components/accounting/transaction-category-dialog.tsx`
- Create: `apps/web/src/components/accounting/transaction-categories-view.tsx`
- Create: `apps/web/src/components/accounting/transaction-categories-view.test.tsx`

**Interfaces:**
- Consumes: `useTransactionCategories` + the category mutation hooks (Task 6); `transactionCategoryFormSchema` (Task 6).

- [ ] **Step 1: Write the failing view test**

`apps/web/src/components/accounting/transaction-categories-view.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionCategoriesView } from './transaction-categories-view';

vi.mock('@/lib/queries/transaction-categories', () => ({
  useTransactionCategories: () => ({
    isLoading: false,
    isError: false,
    data: [
      { id: 'c1', name: 'Consultas', type: 'INCOME', createdAt: '', updatedAt: '' },
      { id: 'c2', name: 'Aluguel', type: 'EXPENSE', createdAt: '', updatedAt: '' },
    ],
  }),
  useCreateTransactionCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTransactionCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransactionCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('TransactionCategoriesView', () => {
  it('lists categories with their type', () => {
    render(<TransactionCategoriesView />);
    expect(screen.getByText('Consultas')).toBeInTheDocument();
    expect(screen.getByText('Aluguel')).toBeInTheDocument();
    expect(screen.getByText('Receita')).toBeInTheDocument();
    expect(screen.getByText('Despesa')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify RED**

Run: `pnpm --filter @nutri-plus/web test -- transaction-categories-view`
Expected: FAIL — module not found.

- [ ] **Step 3: Dialog** — `transaction-category-dialog.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { TransactionCategory } from '@nutri-plus/shared-types';
import {
  transactionCategoryFormSchema,
  type TransactionCategoryFormValues,
} from '@/lib/validation/transaction-category';
import {
  useCreateTransactionCategory,
  useDeleteTransactionCategory,
  useUpdateTransactionCategory,
} from '@/lib/queries/transaction-categories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function defaults(category?: TransactionCategory): TransactionCategoryFormValues {
  return { name: category?.name ?? '', type: category?.type ?? 'EXPENSE' };
}

export function TransactionCategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: TransactionCategory;
}) {
  const create = useCreateTransactionCategory();
  const update = useUpdateTransactionCategory();
  const remove = useDeleteTransactionCategory();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<TransactionCategoryFormValues>({
    resolver: zodResolver(transactionCategoryFormSchema),
    defaultValues: defaults(category),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaults(category));
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  async function onSubmit(values: TransactionCategoryFormValues) {
    setFormError(null);
    try {
      if (category) {
        await update.mutateAsync({ id: category.id, body: values });
        toast.success('Categoria atualizada.');
      } else {
        await create.mutateAsync(values);
        toast.success('Categoria criada.');
      }
      onOpenChange(false);
    } catch {
      const message = 'Não foi possível salvar a categoria.';
      setFormError(message);
      toast.error(message);
    }
  }

  async function onDelete() {
    if (!category) return;
    try {
      await remove.mutateAsync(category.id);
      toast.success('Categoria excluída.');
      onOpenChange(false);
    } catch {
      toast.error('Não foi possível excluir a categoria.');
    }
  }

  const pending =
    form.formState.isSubmitting || create.isPending || update.isPending || remove.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Consultas" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="INCOME">Receita</SelectItem>
                      <SelectItem value="EXPENSE">Despesa</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter className="justify-end">
              {category && (
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto rounded-full text-destructive"
                  onClick={onDelete}
                  disabled={remove.isPending}
                >
                  Excluir
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="rounded-full" disabled={pending}>
                {pending ? 'Salvando…' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: View** — `transaction-categories-view.tsx`

```tsx
'use client';

import { useState } from 'react';
import type { TransactionCategory } from '@nutri-plus/shared-types';
import { useTransactionCategories } from '@/lib/queries/transaction-categories';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TransactionCategoryDialog } from '@/components/accounting/transaction-category-dialog';

export function TransactionCategoriesView() {
  const query = useTransactionCategories();
  const [editing, setEditing] = useState<TransactionCategory | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="font-heading text-2xl font-bold">Categorias</h1>
        <div className="flex-1" />
        <Button className="rounded-full" onClick={() => setCreating(true)}>
          Nova categoria
        </Button>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : query.isError ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar as categorias.
        </div>
      ) : (query.data ?? []).length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma categoria ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {(query.data ?? []).map((category) => (
            <button
              type="button"
              key={category.id}
              onClick={() => setEditing(category)}
              className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left duration-200 hover:opacity-70"
            >
              <span className="text-sm font-semibold">{category.name}</span>
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  category.type === 'INCOME'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {category.type === 'INCOME' ? 'Receita' : 'Despesa'}
              </span>
            </button>
          ))}
        </div>
      )}

      <TransactionCategoryDialog open={creating} onOpenChange={(o) => !o && setCreating(false)} />
      {editing && (
        <TransactionCategoryDialog open onOpenChange={(o) => !o && setEditing(null)} category={editing} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Page** — `contabilidade/categorias/page.tsx`

```tsx
import { TransactionCategoriesView } from '@/components/accounting/transaction-categories-view';

export default function ContabilidadeCategoriasPage() {
  return <TransactionCategoriesView />;
}
```

- [ ] **Step 6: Run test + type check**

Run: `pnpm --filter @nutri-plus/web test -- transaction-categories-view`
Expected: PASS.

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(app)/contabilidade/categorias" apps/web/src/components/accounting/transaction-category-dialog.tsx apps/web/src/components/accounting/transaction-categories-view.tsx apps/web/src/components/accounting/transaction-categories-view.test.tsx
git commit -m "feat(web): Contabilidade categorias (CRUD, typed)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Web — nav + transaction dialog (form)

The create/edit transaction form (dialog) + the Contabilidade nav item.

**Files:**
- Modify: `apps/web/src/components/app/nav-items.ts`
- Create: `apps/web/src/components/accounting/transaction-dialog.tsx`
- Create: `apps/web/src/components/accounting/transaction-dialog.test.tsx`

**Interfaces:**
- Consumes: `transactionFormSchema` / `parseBRLToCents` (Task 6); `useTransactionCategories`, `useCreateTransaction`, `useUpdateTransaction`, `useDeleteTransaction`.
- Produces: `TransactionDialog({ open, onOpenChange, transaction? })` — reused for create + edit by `AccountingView` (Task 9).

- [ ] **Step 1: Add the nav item**

In `apps/web/src/components/app/nav-items.ts`, add `Landmark` to the `lucide-react` import, and a nav entry (no `canAccess` — both roles):

```ts
import { Users, Briefcase, Calendar, Settings, Landmark, type LucideIcon } from 'lucide-react';
```

Add to `NAV_ITEMS` (before Configurações):

```ts
  {
    label: 'Contabilidade',
    href: '/contabilidade',
    icon: Landmark,
    children: [
      { label: 'Extrato', href: '/contabilidade' },
      { label: 'Categorias', href: '/contabilidade/categorias' },
    ],
  },
```

- [ ] **Step 2: Write the failing dialog test**

`apps/web/src/components/accounting/transaction-dialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TransactionDialog } from './transaction-dialog';

const createMutate = vi.fn().mockResolvedValue({});
vi.mock('@/lib/queries/transactions', () => ({
  useCreateTransaction: () => ({ mutateAsync: createMutate, isPending: false }),
  useUpdateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/queries/transaction-categories', () => ({
  useTransactionCategories: () => ({ data: [], isLoading: false }),
}));

describe('TransactionDialog', () => {
  it('submits the amount as integer cents', async () => {
    render(<TransactionDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '1.234,56' } });
    fireEvent.change(screen.getByLabelText(/data/i), { target: { value: '2026-07-03' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(createMutate).toHaveBeenCalled());
    expect(createMutate.mock.calls[0][0]).toMatchObject({ amountCents: 123456, type: 'EXPENSE' });
  });
});
```

- [ ] **Step 3: Run it to verify RED**

Run: `pnpm --filter @nutri-plus/web test -- transaction-dialog`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `transaction-dialog.tsx`**

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { Transaction } from '@nutri-plus/shared-types';
import { transactionFormSchema, type TransactionFormValues } from '@/lib/validation/transaction';
import { parseBRLToCents } from '@/lib/format/currency';
import {
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from '@/lib/queries/transactions';
import { useTransactionCategories } from '@/lib/queries/transaction-categories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NO_CATEGORY = '__none__';

function toDateInput(iso?: string): string {
  return iso ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function centsToInput(cents?: number): string {
  return cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

function defaults(t?: Transaction): TransactionFormValues {
  return {
    type: t?.type ?? 'EXPENSE',
    amount: centsToInput(t?.amountCents),
    occurredOn: toDateInput(t?.occurredOn),
    categoryId: t?.categoryId ?? null,
    description: t?.description ?? '',
  };
}

export function TransactionDialog({
  open,
  onOpenChange,
  transaction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction;
}) {
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: defaults(transaction),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaults(transaction));
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction]);

  const type = form.watch('type');
  const categories = useTransactionCategories();
  // Only categories matching the selected type are selectable.
  const options = useMemo(
    () => (categories.data ?? []).filter((c) => c.type === type),
    [categories.data, type],
  );

  async function onSubmit(values: TransactionFormValues) {
    setFormError(null);
    const body = {
      type: values.type,
      amountCents: parseBRLToCents(values.amount),
      occurredOn: new Date(`${values.occurredOn}T12:00:00`).toISOString(),
      categoryId: values.categoryId ?? null,
      description: values.description?.trim() ? values.description.trim() : null,
    };
    try {
      if (transaction) {
        await update.mutateAsync({ id: transaction.id, body });
        toast.success('Transação atualizada.');
      } else {
        await create.mutateAsync(body);
        toast.success('Transação registrada.');
      }
      onOpenChange(false);
    } catch {
      const message = 'Não foi possível salvar a transação.';
      setFormError(message);
      toast.error(message);
    }
  }

  async function onDelete() {
    if (!transaction) return;
    try {
      await remove.mutateAsync(transaction.id);
      toast.success('Transação excluída.');
      onOpenChange(false);
    } catch {
      toast.error('Não foi possível excluir a transação.');
    }
  }

  const pending =
    form.formState.isSubmitting || create.isPending || update.isPending || remove.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{transaction ? 'Editar transação' : 'Nova transação'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      form.setValue('categoryId', null); // reset category when type changes
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="INCOME">Receita</SelectItem>
                      <SelectItem value="EXPENSE">Despesa</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor (R$) *</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" placeholder="0,00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="occurredOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <Select
                    value={field.value ?? NO_CATEGORY}
                    onValueChange={(v) => field.onChange(v === NO_CATEGORY ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sem categoria" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                      {options.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Opcional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter className="justify-end">
              {transaction && (
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto rounded-full text-destructive"
                  onClick={onDelete}
                  disabled={remove.isPending}
                >
                  Excluir
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="rounded-full" disabled={pending}>
                {pending ? 'Salvando…' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Run test + type check + full web suite**

Run: `pnpm --filter @nutri-plus/web test -- transaction-dialog`
Expected: PASS.

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter @nutri-plus/web test`
Expected: green. If `apps/web/src/components/app/app-sidebar.test.tsx` asserts the exact nav set (labels/count), update it to include "Contabilidade" (label + `/contabilidade` href + Extrato/Categorias children).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/app/nav-items.ts apps/web/src/components/accounting/transaction-dialog.tsx apps/web/src/components/accounting/transaction-dialog.test.tsx
git commit -m "feat(web): Contabilidade nav + transaction dialog (cents-safe form)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Web — Extrato page (period + summary + statement table)

The main Contabilidade page: period selector, summary cards, statement table with running balance, and the "Nova transação" button. (The chart is added in Task 10.)

**Files:**
- Create: `apps/web/src/components/accounting/summary-cards.tsx`
- Create: `apps/web/src/components/accounting/statement-table.tsx`
- Create: `apps/web/src/components/accounting/accounting-view.tsx`
- Create: `apps/web/src/components/accounting/statement-table.test.tsx`
- Create: `apps/web/src/app/(app)/contabilidade/page.tsx`

**Interfaces:**
- Consumes: `useStatement` (Task 6), `formatBRL` (Task 6), `TransactionDialog` (Task 8), `AccountingStatement`/`StatementItem` (shared-types).
- Produces: `AccountingView` (client) — the extrato page body; `MonthlyChart` slot filled in Task 10.

- [ ] **Step 1: Write the failing statement-table test**

`apps/web/src/components/accounting/statement-table.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatementTable } from './statement-table';
import type { AccountingStatement } from '@nutri-plus/shared-types';

const statement: AccountingStatement = {
  openingBalanceCents: 10000,
  totals: { incomeCents: 50000, expenseCents: 20000, netCents: 30000 },
  items: [
    {
      id: 'b', type: 'EXPENSE', amountCents: 20000, occurredOn: '2026-07-05T12:00:00.000Z',
      categoryId: null, category: null, description: 'Aluguel', createdAt: '', updatedAt: '',
      balanceCents: 40000,
    },
    {
      id: 'a', type: 'INCOME', amountCents: 50000, occurredOn: '2026-07-02T12:00:00.000Z',
      categoryId: null, category: null, description: 'Consulta', createdAt: '', updatedAt: '',
      balanceCents: 60000,
    },
  ],
};

describe('StatementTable', () => {
  it('renders rows with signed amounts and the running balance', () => {
    render(<StatementTable statement={statement} onEdit={vi.fn()} />);
    expect(screen.getByText('Aluguel')).toBeInTheDocument();
    expect(screen.getByText('Consulta')).toBeInTheDocument();
    // expense shown negative, income positive (BRL uses  )
    expect(screen.getByText('-R$ 200,00')).toBeInTheDocument();
    expect(screen.getByText('+R$ 500,00')).toBeInTheDocument();
    // running balances
    expect(screen.getByText('R$ 400,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 600,00')).toBeInTheDocument();
  });

  it('shows an empty state with no items', () => {
    render(
      <StatementTable
        statement={{ openingBalanceCents: 0, totals: { incomeCents: 0, expenseCents: 0, netCents: 0 }, items: [] }}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText(/nenhuma transação/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify RED**

Run: `pnpm --filter @nutri-plus/web test -- statement-table`
Expected: FAIL — module not found.

- [ ] **Step 3: `statement-table.tsx`**

```tsx
'use client';

import type { AccountingStatement, StatementItem } from '@nutri-plus/shared-types';
import { formatBRL } from '@/lib/format/currency';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function StatementTable({
  statement,
  onEdit,
}: {
  statement: AccountingStatement;
  onEdit: (item: StatementItem) => void;
}) {
  if (statement.items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhuma transação neste período.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-3 font-medium">Data</th>
            <th className="p-3 font-medium">Descrição</th>
            <th className="p-3 font-medium">Categoria</th>
            <th className="p-3 text-right font-medium">Valor</th>
            <th className="p-3 text-right font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {statement.items.map((item) => {
            const income = item.type === 'INCOME';
            return (
              <tr
                key={item.id}
                onClick={() => onEdit(item)}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
              >
                <td className="whitespace-nowrap p-3 tabular-nums">{formatDate(item.occurredOn)}</td>
                <td className="p-3">{item.description ?? '—'}</td>
                <td className="p-3">
                  {item.category ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                      {item.category.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td
                  className={`p-3 text-right tabular-nums font-medium ${
                    income ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {`${income ? '+' : '-'}${formatBRL(item.amountCents)}`}
                </td>
                <td className="p-3 text-right tabular-nums">{formatBRL(item.balanceCents)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t text-xs text-muted-foreground">
            <td className="p-3" colSpan={4}>
              Saldo anterior
            </td>
            <td className="p-3 text-right tabular-nums">{formatBRL(statement.openingBalanceCents)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: `summary-cards.tsx`**

```tsx
'use client';

import type { AccountingStatement } from '@nutri-plus/shared-types';
import { formatBRL } from '@/lib/format/currency';
import { Card } from '@/components/ui/card';

export function SummaryCards({ totals }: { totals: AccountingStatement['totals'] }) {
  const cards = [
    { label: 'Entradas', value: totals.incomeCents, className: 'text-green-600' },
    { label: 'Saídas', value: totals.expenseCents, className: 'text-red-600' },
    {
      label: 'Saldo',
      value: totals.netCents,
      className: totals.netCents >= 0 ? 'text-green-600' : 'text-red-600',
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label} className="p-4">
          <p className="text-xs uppercase text-muted-foreground">{c.label}</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${c.className}`}>{formatBRL(c.value)}</p>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: `accounting-view.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import type { StatementItem } from '@nutri-plus/shared-types';
import { useStatement } from '@/lib/queries/transactions';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SummaryCards } from '@/components/accounting/summary-cards';
import { StatementTable } from '@/components/accounting/statement-table';
import { MonthlyChart } from '@/components/accounting/monthly-chart';
import { TransactionDialog } from '@/components/accounting/transaction-dialog';

// [start-of-month, start-of-next-month) in UTC for the given year/month index.
function monthRange(year: number, month: number): { fromISO: string; toISO: string } {
  return {
    fromISO: new Date(Date.UTC(year, month, 1)).toISOString(),
    toISO: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  };
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function AccountingView() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StatementItem | null>(null);

  const { fromISO, toISO } = useMemo(() => monthRange(year, month), [year, month]);
  const statement = useStatement(fromISO, toISO);

  function shift(delta: number) {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-2xl font-bold">Contabilidade</h1>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => shift(-1)}>
            ‹
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-medium capitalize">
            {MONTHS[month]} {year}
          </span>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => shift(1)}>
            ›
          </Button>
        </div>
        <Button className="rounded-full" onClick={() => setCreating(true)}>
          Nova transação
        </Button>
      </div>

      <MonthlyChart />

      {statement.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : statement.isError || !statement.data ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar o extrato.
        </div>
      ) : (
        <>
          <SummaryCards totals={statement.data.totals} />
          <StatementTable statement={statement.data} onEdit={(item) => setEditing(item)} />
        </>
      )}

      <TransactionDialog open={creating} onOpenChange={(o) => !o && setCreating(false)} />
      {editing && (
        <TransactionDialog open onOpenChange={(o) => !o && setEditing(null)} transaction={editing} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Page** — `contabilidade/page.tsx`

```tsx
import { AccountingView } from '@/components/accounting/accounting-view';

export default function ContabilidadePage() {
  return <AccountingView />;
}
```

- [ ] **Step 7: Run test + type check**

Run: `pnpm --filter @nutri-plus/web test -- statement-table`
Expected: PASS (2 cases).

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: no errors (note: `accounting-view.tsx` imports `MonthlyChart`, created next in Task 10 — this step's tsc will fail on that import until Task 10; run tsc after Task 10, and here just run the statement-table test). Skip the repo-wide tsc until Task 10.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/accounting/summary-cards.tsx apps/web/src/components/accounting/statement-table.tsx apps/web/src/components/accounting/accounting-view.tsx apps/web/src/components/accounting/statement-table.test.tsx "apps/web/src/app/(app)/contabilidade/page.tsx"
git commit -m "feat(web): Contabilidade extrato (period + summary + statement)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Web — monthly bar chart

The recharts grouped income/expense bar chart (last 12 months), filling the `MonthlyChart` slot in `AccountingView`.

**Files:**
- Create: `apps/web/src/components/accounting/monthly-chart.tsx`
- Create: `apps/web/src/components/accounting/monthly-chart.test.tsx`

**Interfaces:**
- Consumes: `useMonthlySummary` (Task 6), `formatBRL`, `MonthlyAccountingSummary`.
- Produces: `MonthlyChart()` — no props (used by `AccountingView`).

- [ ] **Step 1: Write the failing test** (data mapping, without asserting SVG internals)

`apps/web/src/components/accounting/monthly-chart.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { toChartData } from './monthly-chart';

vi.mock('@/lib/queries/transactions', () => ({
  useMonthlySummary: () => ({ data: [], isLoading: false }),
}));

describe('toChartData', () => {
  it('maps summary cents to reais and a short pt-BR month label', () => {
    const rows = toChartData([
      { month: '2026-07', incomeCents: 50000, expenseCents: 20000 },
      { month: '2026-08', incomeCents: 0, expenseCents: 1500 },
    ]);
    expect(rows).toEqual([
      { label: 'jul', income: 500, expense: 200 },
      { label: 'ago', income: 0, expense: 15 },
    ]);
  });
});

describe('MonthlyChart', () => {
  it('renders without crashing when there is no data', async () => {
    const { MonthlyChart } = await import('./monthly-chart');
    render(<MonthlyChart />);
    expect(screen.getByText(/entradas x saídas/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify RED**

Run: `pnpm --filter @nutri-plus/web test -- monthly-chart`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `monthly-chart.tsx`**

```tsx
'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyAccountingSummary } from '@nutri-plus/shared-types';
import { useMonthlySummary } from '@/lib/queries/transactions';
import { formatBRL } from '@/lib/format/currency';
import { Card } from '@/components/ui/card';

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

type ChartRow = { label: string; income: number; expense: number };

// Exported for unit testing the mapping without touching the SVG.
export function toChartData(summary: MonthlyAccountingSummary[]): ChartRow[] {
  return summary.map((m) => {
    const monthIndex = Number(m.month.slice(5, 7)) - 1;
    return {
      label: MONTH_ABBR[monthIndex] ?? m.month,
      income: m.incomeCents / 100,
      expense: m.expenseCents / 100,
    };
  });
}

export function MonthlyChart() {
  const query = useMonthlySummary(12);
  const data = toChartData(query.data ?? []);

  return (
    <Card className="p-4">
      <p className="mb-3 text-sm font-semibold">Entradas x Saídas (12 meses)</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" fontSize={11} stroke="var(--muted-foreground)" />
          <YAxis fontSize={11} stroke="var(--muted-foreground)" width={56} />
          <Tooltip
            formatter={(value: number) => formatBRL(Math.round(value * 100))}
            labelClassName="text-foreground"
          />
          <Legend />
          <Bar name="Entradas" dataKey="income" fill="#16a34a" radius={[4, 4, 0, 0]} />
          <Bar name="Saídas" dataKey="expense" fill="#dc2626" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
```

- [ ] **Step 4: Run test + type check + full web suite**

Run: `pnpm --filter @nutri-plus/web test -- monthly-chart`
Expected: PASS.

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: no errors (now that `MonthlyChart` exists).

Run: `pnpm --filter @nutri-plus/web test`
Expected: full web suite green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/accounting/monthly-chart.tsx apps/web/src/components/accounting/monthly-chart.test.tsx
git commit -m "feat(web): monthly income-vs-expense bar chart (accounting)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- `pnpm --filter @nutri-plus/shared-types build` — clean.
- `pnpm --filter @nutri-plus/api test` — green (+ transaction-categories & transactions specs).
- `pnpm --filter @nutri-plus/web test` — green (+ currency, categorias, dialog, statement, chart).
- `pnpm --filter @nutri-plus/web exec tsc --noEmit` and `pnpm --filter @nutri-plus/api exec tsc --noEmit` — clean.
- Manual (both a nutritionist and an employee login on the shared dev DB): create income/expense categories; register transactions of each type; the extrato shows them newest-first with a correct running balance + summary cards; the month selector filters; the 12-month chart shows grouped bars; editing/deleting a transaction updates the extrato and chart; an employee has the same access.
