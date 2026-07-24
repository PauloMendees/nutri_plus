# Recordatório Alimentar 24h (D2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um recordatório alimentar 24h datado (registro do que o paciente comeu) montado pelo nutricionista no web, com alimentos do TACO (macros auto via `macrosForPortion`) e totais do dia vs. a última meta nutricional.

**Architecture:** Um sub-recurso patient-scoped `patients/:id/food-recalls` (CRUD em árvore, espelhando `meal-plans` **menos o nível de opções**: `FoodRecall → RecallMeal → RecallItem`). Editor web dedicado numa página roteada (espelha `meal-plan-editor` sem opções, + data + barra total-vs-meta). Uma aba "Recordatório" lista os recordatórios e linka para o editor.

**Tech Stack:** NestJS + Prisma 7; Next.js + react-hook-form + zod + react-query; `@nutri-plus/shared-types` (`macrosForPortion`, `FoodSearch`/`FoodPickerDialog`). Testes API JEST / web vitest.

## Global Constraints

- Migração **aditiva** (`FoodRecall`/`RecallMeal`/`RecallItem`, todas `onDelete: Cascade`; `RecallItem.food` `onDelete: SetNull`; back-relations `PatientProfile.foodRecalls` + `Food.recallItems`; `prisma migrate dev`; `prisma generate` se preciso). shared-types reconstruído. **Sem novas dependências.** pt-BR.
- **NUTRICIONISTA-only (web); paciente/mobile INALTERADO.** `@Roles(UserRole.NUTRITIONIST)` + posse do paciente → **404**, `resolveScopeNutritionistId`.
- **Sem opções/alternativas** (mais enxuto que o plano): `FoodRecall → RecallMeal → RecallItem` (espelha `MealPlan → Meal → MealItem` menos `MealOption`). Editor **dedicado** (não sobrecarregar o editor de plano).
- Servidor **grava o que o editor envia** (macros client-side, como no A2 — o spread `...it` persiste `foodId/grams/fiber/sodium` + macros). Valida `foodId` inexistente → 400.
- Totais do dia somam **todos os itens de todas as refeições** (sem opções) vs. a **última `NutritionTarget`** (kcal/P/C/G; fibra/sódio total-only).
- Reusar: item/food-ref do A2, `FoodSearch`/`FoodPickerDialog`, `macrosForPortion`, CRUD-em-árvore do `meal-plans`, histórico datado das avaliações, react-hook-form + zod, abas/páginas roteadas do detalhe. Aspas: api simples; web por arquivo. Testes API JEST / web vitest. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** push/PR. Branch `feat/recordatorio-24h`. Verificar por área: shared-types build; API test+tsc; web test+tsc.

## File Structure

- `packages/shared-types/src/v1/food-recall.ts` (novo) + `v1/index.ts`.
- `apps/api/prisma/schema.prisma` (+ 3 models + back-relations) + migração.
- `apps/api/src/food-recalls/` — `food-recalls.module.ts`, `food-recalls.controller.ts`, `food-recalls.service.ts`, `dto/{create-food-recall,update-food-recall,recall-meal,recall-item}.dto.ts`, `food-recalls.service.spec.ts`.
- `apps/web/src/lib/api/food-recalls.ts` + `lib/queries/food-recalls.ts` + `lib/validation/food-recall.ts` + `components/patients/{food-recall-editor,recordatorio-section}.tsx` (+ tests) + `app/(app)/patients/[id]/recordatorios/{novo/page.tsx,[recallId]/page.tsx}` + `patient-detail.tsx` (aba).

---

### Task 1: shared-types + migração (FoodRecall/RecallMeal/RecallItem)

**Files:** Create `packages/shared-types/src/v1/food-recall.ts`; Modify `packages/shared-types/src/v1/index.ts`, `apps/api/prisma/schema.prisma` (+ migração).

- [ ] **Step 1: shared-type** — criar `packages/shared-types/src/v1/food-recall.ts` (espelha `meal-plan.ts` sem o nível de opção):
```ts
export interface RecallItem {
  id: string;
  recallMealId: string;
  foodName: string | null;
  quantity: string | null;
  grams: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  fiber: number | null;
  sodium: number | null;
  foodId: string | null;
  order: number;
}

export interface RecallMeal {
  id: string;
  foodRecallId: string;
  name: string | null;
  timeLabel: string | null;
  order: number;
  items: RecallItem[];
}

export interface FoodRecall {
  id: string;
  patientId: string;
  recallDate: string; // ISO
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  meals: RecallMeal[];
}

export type FoodRecallSummary = Omit<FoodRecall, 'meals'>;

export interface RecallItemInput {
  foodName?: string;
  quantity?: string;
  grams?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  fiber?: number;
  sodium?: number;
  foodId?: string;
}

export interface RecallMealInput {
  name?: string;
  timeLabel?: string;
  items?: RecallItemInput[];
}

export interface CreateFoodRecallRequest {
  patientId: string;
  recallDate?: string;
  notes?: string;
  meals?: RecallMealInput[];
}

export type UpdateFoodRecallRequest = Omit<CreateFoodRecallRequest, 'patientId'>;
```
Em `packages/shared-types/src/v1/index.ts`: `export * from './food-recall';`

- [ ] **Step 2: Migração** — em `apps/api/prisma/schema.prisma`, no `model PatientProfile` (junto às relações), adicionar `foodRecalls FoodRecall[]`; no `model Food`, adicionar `recallItems RecallItem[]`. Adicionar os models:
```prisma
model FoodRecall {
  id          String   @id @default(uuid())
  patientId   String
  patient     PatientProfile @relation(fields: [patientId], references: [id], onDelete: Cascade)
  recallDate  DateTime @default(now())
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  meals       RecallMeal[]

  @@index([patientId, recallDate])
}

model RecallMeal {
  id           String   @id @default(uuid())
  foodRecallId String
  foodRecall   FoodRecall @relation(fields: [foodRecallId], references: [id], onDelete: Cascade)
  name         String?
  timeLabel    String?
  order        Int
  items        RecallItem[]

  @@index([foodRecallId])
}

model RecallItem {
  id           String   @id @default(uuid())
  recallMealId String
  recallMeal   RecallMeal @relation(fields: [recallMealId], references: [id], onDelete: Cascade)
  foodId       String?
  food         Food?    @relation(fields: [foodId], references: [id], onDelete: SetNull)
  foodName     String?
  quantity     String?
  grams        Float?
  calories     Float?
  protein      Float?
  carbs        Float?
  fats         Float?
  fiber        Float?
  sodium       Float?
  order        Int

  @@index([recallMealId])
}
```
Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name food_recall` — migração só com `CREATE TABLE` (×3) + índices + FKs (Cascade + a FK `SetNull` de `RecallItem.food`), **sem** DROP/alteração de tabela existente. `prisma generate` se o client não atualizar.

- [ ] **Step 3: Build + commit**

Run: `pnpm --filter @nutri-plus/shared-types build` (sem erros).
```bash
git add packages/shared-types/src/v1/food-recall.ts packages/shared-types/src/v1/index.ts apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: FoodRecall/RecallMeal/RecallItem models + shared types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: API food-recalls (CRUD em árvore)

**Files:** Create `apps/api/src/food-recalls/{food-recalls.module.ts,food-recalls.controller.ts,food-recalls.service.ts,dto/create-food-recall.dto.ts,dto/update-food-recall.dto.ts,dto/recall-meal.dto.ts,dto/recall-item.dto.ts,food-recalls.service.spec.ts}`; Modify `apps/api/src/app.module.ts`.

**Interfaces:** Consumes `resolveScopeNutritionistId`, `PrismaService`. Produces `POST/GET/GET :recallId/PUT :recallId/DELETE :recallId /v1/patients/:id/food-recalls`.

- [ ] **Step 1: DTOs** — criar (espelham `apps/api/src/meal-plans/dto/*`):

`dto/recall-item.dto.ts`:
```ts
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class RecallItemDto {
  @IsOptional() @IsString() @MaxLength(200) foodName?: string;
  @IsOptional() @IsString() @MaxLength(100) quantity?: string;
  @IsOptional() @IsUUID() foodId?: string;
  @IsOptional() @IsNumber() @Min(0) grams?: number;
  @IsOptional() @IsNumber() @Min(0) calories?: number;
  @IsOptional() @IsNumber() @Min(0) protein?: number;
  @IsOptional() @IsNumber() @Min(0) carbs?: number;
  @IsOptional() @IsNumber() @Min(0) fats?: number;
  @IsOptional() @IsNumber() @Min(0) fiber?: number;
  @IsOptional() @IsNumber() @Min(0) sodium?: number;
}
```
`dto/recall-meal.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { RecallItemDto } from './recall-item.dto';

export class RecallMealDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(100) timeLabel?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RecallItemDto) items?: RecallItemDto[];
}
```
`dto/update-food-recall.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { RecallMealDto } from './recall-meal.dto';

export class UpdateFoodRecallDto {
  @IsOptional() @IsDateString() recallDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RecallMealDto) meals?: RecallMealDto[];
}
```
`dto/create-food-recall.dto.ts`:
```ts
import { IsUUID } from 'class-validator';
import { UpdateFoodRecallDto } from './update-food-recall.dto';

export class CreateFoodRecallDto extends UpdateFoodRecallDto {
  @IsUUID()
  patientId!: string;
}
```

- [ ] **Step 2: Service spec que falha** — criar `apps/api/src/food-recalls/food-recalls.service.spec.ts` (mockar `mockDeep<PrismaService>`, `ctx` nutricionista; mirar `meal-plans.service.spec.ts`). Cobrir: create monta a árvore com `order` por índice + `foodId` validado; `foodId` inexistente → 400 (não cria); list por `recallDate` desc; get árvore; não-possuído → 404 (get/update/delete); update substitui a árvore (deleteMany meals + recria). Exemplo do essencial:
```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { FoodRecallsService } from './food-recalls.service';
import { AuthContext } from '../auth/types/auth-context';

const ctx = { user: { role: 'NUTRITIONIST', nutritionistProfile: { id: 'n1' } } } as unknown as AuthContext;

describe('FoodRecallsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: FoodRecallsService;
  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new FoodRecallsService(prisma);
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
    prisma.food.findMany.mockResolvedValue([{ id: 'f1' }] as any);
  });

  it('creates the tree scoped to an owned patient (order by index, foodId persisted)', async () => {
    prisma.foodRecall.create.mockResolvedValue({ id: 'r1' } as any);
    await service.create(ctx, {
      patientId: 'p1', recallDate: '2026-07-22',
      meals: [{ name: 'Café', items: [{ foodName: 'Ovos', foodId: 'f1', grams: 100, calories: 143 }] }],
    });
    const arg = prisma.foodRecall.create.mock.calls[0][0] as any;
    expect(arg.data.patientId).toBe('p1');
    expect(arg.data.meals.create[0].order).toBe(0);
    expect(arg.data.meals.create[0].items.create[0]).toEqual(
      expect.objectContaining({ foodId: 'f1', grams: 100, calories: 143, order: 0 }),
    );
  });

  it('rejects an unknown foodId with 400 (creates nothing)', async () => {
    prisma.food.findMany.mockResolvedValue([]);
    await expect(
      service.create(ctx, { patientId: 'p1', meals: [{ items: [{ foodId: 'nope' }] }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.foodRecall.create).not.toHaveBeenCalled();
  });

  it('404s a non-owned patient on get/update/delete', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(null);
    await expect(service.list(ctx, 'pX')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update replaces the tree (deletes meals then recreates) for an owned recall', async () => {
    prisma.foodRecall.findFirst.mockResolvedValue({ id: 'r1', patientId: 'p1' } as any);
    prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
    prisma.foodRecall.update.mockResolvedValue({ id: 'r1' } as any);
    await service.update(ctx, 'r1', { notes: 'x', meals: [{ name: 'Almoço', items: [] }] });
    expect(prisma.recallMeal.deleteMany).toHaveBeenCalledWith({ where: { foodRecallId: 'r1' } });
    expect(prisma.foodRecall.update).toHaveBeenCalled();
  });
});
```
Run: `pnpm --filter @nutri-plus/api test -- food-recalls.service` → FAIL.

- [ ] **Step 3: Service** — criar `apps/api/src/food-recalls/food-recalls.service.ts` (espelha `meal-plans.service.ts`):
```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { CreateFoodRecallDto } from './dto/create-food-recall.dto';
import { UpdateFoodRecallDto } from './dto/update-food-recall.dto';
import { RecallMealDto } from './dto/recall-meal.dto';

const FULL_TREE = {
  meals: {
    orderBy: { order: 'asc' },
    include: { items: { orderBy: { order: 'asc' } } },
  },
} as const;

@Injectable()
export class FoodRecallsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: AuthContext, dto: CreateFoodRecallDto) {
    await this.requireOwnedPatient(ctx, dto.patientId);
    const { patientId, meals, ...top } = dto;
    if (meals) await this.assertFoodsExist(meals);
    return this.prisma.foodRecall.create({
      data: { ...top, patientId, meals: meals ? this.mealsCreateInput(meals) : undefined },
      include: FULL_TREE,
    });
  }

  async list(ctx: AuthContext, patientId: string) {
    await this.requireOwnedPatient(ctx, patientId);
    return this.prisma.foodRecall.findMany({
      where: { patientId },
      orderBy: { recallDate: 'desc' },
    });
  }

  async get(ctx: AuthContext, id: string) {
    const recall = await this.prisma.foodRecall.findFirst({
      where: { id, patient: { nutritionistId: resolveScopeNutritionistId(ctx) } },
      include: FULL_TREE,
    });
    if (!recall) throw new NotFoundException('Food recall not found');
    return recall;
  }

  async update(ctx: AuthContext, id: string, dto: UpdateFoodRecallDto) {
    await this.requireOwnedRecall(ctx, id);
    const { meals, ...top } = dto;
    if (!meals) {
      return this.prisma.foodRecall.update({ where: { id }, data: top, include: FULL_TREE });
    }
    await this.assertFoodsExist(meals);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.recallMeal.deleteMany({ where: { foodRecallId: id } });
        return tx.foodRecall.update({
          where: { id },
          data: { ...top, meals: this.mealsCreateInput(meals) },
          include: FULL_TREE,
        });
      },
      { timeout: 20000, maxWait: 10000 },
    );
  }

  async delete(ctx: AuthContext, id: string) {
    await this.requireOwnedRecall(ctx, id);
    return this.prisma.foodRecall.delete({ where: { id } });
  }

  private mealsCreateInput(meals: RecallMealDto[]) {
    return {
      create: meals.map((m, i) => ({
        name: m.name,
        timeLabel: m.timeLabel,
        order: i,
        items: m.items ? { create: m.items.map((it, k) => ({ ...it, order: k })) } : undefined,
      })),
    };
  }

  private async assertFoodsExist(meals: RecallMealDto[]): Promise<void> {
    const ids = [
      ...new Set(
        meals.flatMap((m) => m.items ?? []).map((it) => it.foodId).filter((id): id is string => !!id),
      ),
    ];
    if (ids.length === 0) return;
    const found = await this.prisma.food.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (found.length !== ids.length) {
      throw new BadRequestException('Alimento inexistente referenciado no recordatório.');
    }
  }

  private async requireOwnedPatient(ctx: AuthContext, patientId: string): Promise<void> {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
  }

  private async requireOwnedRecall(ctx: AuthContext, id: string): Promise<void> {
    const recall = await this.prisma.foodRecall.findFirst({
      where: { id, patient: { nutritionistId: resolveScopeNutritionistId(ctx) } },
      select: { id: true },
    });
    if (!recall) throw new NotFoundException('Food recall not found');
  }
}
```
Run: `pnpm --filter @nutri-plus/api test -- food-recalls.service` → PASS.

- [ ] **Step 4: Controller + module + registro** — criar `apps/api/src/food-recalls/food-recalls.controller.ts` (espelha `meal-plans.controller.ts`; a lista usa `@Query('patientId', ParseUUIDPipe)`):
```ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { FoodRecallsService } from './food-recalls.service';
import { CreateFoodRecallDto } from './dto/create-food-recall.dto';
import { UpdateFoodRecallDto } from './dto/update-food-recall.dto';

@ApiTags('food-recalls')
@ApiBearerAuth()
@Controller({ path: 'food-recalls', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class FoodRecallsController {
  constructor(private readonly service: FoodRecallsService) {}

  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreateFoodRecallDto) {
    return this.service.create(ctx, dto);
  }

  @Get()
  @Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
  list(@CurrentUser() ctx: AuthContext, @Query('patientId', ParseUUIDPipe) patientId: string) {
    return this.service.list(ctx, patientId);
  }

  @Get(':id')
  @Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
  findOne(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.service.get(ctx, id);
  }

  @Put(':id')
  update(@CurrentUser() ctx: AuthContext, @Param('id') id: string, @Body() dto: UpdateFoodRecallDto) {
    return this.service.update(ctx, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.service.delete(ctx, id);
  }
}
```
(Rotas: `/v1/food-recalls?patientId=…` para a lista + `/v1/food-recalls/:id` — o `patientId` do create vem no body, como o `meal-plans`. Isso mantém o padrão do `meal-plans` controller.)
Criar `food-recalls.module.ts` (`@Module({ controllers: [FoodRecallsController], providers: [FoodRecallsService] })`) e registrar `FoodRecallsModule` em `apps/api/src/app.module.ts`.

- [ ] **Step 5: Verificação + commit**

Run: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit` (verde; tsc 0).
```bash
git add apps/api/src/food-recalls apps/api/src/app.module.ts
git commit -m "feat(api): 24h food recall CRUD (/v1/food-recalls)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Web — data layer + `FoodRecallEditor`

**Files:** Create `apps/web/src/lib/api/food-recalls.ts`, `lib/queries/food-recalls.ts`, `lib/validation/food-recall.ts`, `components/patients/food-recall-editor.tsx` (+ test).

**Interfaces:** Consumes `FoodRecall`/`FoodRecallSummary`/`Create/UpdateFoodRecallRequest`, `browserApiFetch`, `macrosForPortion`, `FoodPickerDialog`, `useNutritionTargets`. Produces `<FoodRecallEditor patientId recallId? canEdit />`.

- [ ] **Step 1: Data layer** — criar `apps/web/src/lib/api/food-recalls.ts` (mirar `lib/api/meal-plans.ts`):
```ts
import type {
  CreateFoodRecallRequest, FoodRecall, FoodRecallSummary, UpdateFoodRecallRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function listFoodRecalls(patientId: string): Promise<FoodRecallSummary[]> {
  return browserApiFetch<FoodRecallSummary[]>(`/food-recalls?patientId=${patientId}`);
}
export function getFoodRecall(id: string): Promise<FoodRecall> {
  return browserApiFetch<FoodRecall>(`/food-recalls/${id}`);
}
export function createFoodRecall(body: CreateFoodRecallRequest): Promise<FoodRecall> {
  return browserApiFetch<FoodRecall>('/food-recalls', { method: 'POST', body });
}
export function updateFoodRecall(id: string, body: UpdateFoodRecallRequest): Promise<FoodRecall> {
  return browserApiFetch<FoodRecall>(`/food-recalls/${id}`, { method: 'PUT', body });
}
export function deleteFoodRecall(id: string): Promise<void> {
  return browserApiFetch<void>(`/food-recalls/${id}`, { method: 'DELETE' });
}
```
Criar `apps/web/src/lib/queries/food-recalls.ts` (mirar `lib/queries/meal-plans.ts` — hooks `useFoodRecalls`/`useFoodRecall`/`useCreateFoodRecall`/`useUpdateFoodRecall`/`useDeleteFoodRecall`, key `['food-recalls', patientId]`, invalida na mutação; `useFoodRecall(id)` key `['food-recall', id]`).
Criar `apps/web/src/lib/validation/food-recall.ts` (mirar `lib/validation/meal-plan.ts` — `emptyToUndefined`, `optText`, `optNum`; `foodId` como string opcional):
```ts
import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);
const optText = (max: number) => z.preprocess(emptyToUndefined, z.string().max(max).optional());
const optNum = z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional());

const recallItemSchema = z.object({
  foodName: optText(200), quantity: optText(100),
  foodId: z.preprocess(emptyToUndefined, z.string().optional()),
  grams: optNum, calories: optNum, protein: optNum, carbs: optNum, fats: optNum, fiber: optNum, sodium: optNum,
});
const recallMealSchema = z.object({
  name: optText(200), timeLabel: optText(100), items: z.array(recallItemSchema),
});
export const foodRecallSchema = z.object({
  recallDate: optText(40), notes: optText(2000), meals: z.array(recallMealSchema),
});
export type FoodRecallFormValues = z.infer<typeof foodRecallSchema>;
```

- [ ] **Step 2: Teste que falha (vitest)** — criar `apps/web/src/components/patients/food-recall-editor.test.tsx` (mirar `meal-plan-editor.test.tsx`): mockar `@/lib/queries/food-recalls` (`useFoodRecall` → uma recall fixture com 1 refeição/1 item; `useCreateFoodRecall`/`useUpdateFoodRecall`/`useDeleteFoodRecall`), `@/lib/queries/nutrition-targets` (`useNutritionTargets` → `{ data: [{ targetCalories: 2000, proteinGrams: 150, carbGrams: 200, fatGrams: 55 }] }`), `@/lib/queries/foods` (`useFoodSearch`), `next/navigation`. Asserções: renderiza o item da fixture; o total do dia (`total-calories`) soma **todos** os itens e mostra `/2000`; "Salvar" chama a mutation (update no modo edição); `!canEdit` sem "Salvar". Run → FAIL.

- [ ] **Step 3: Editor** — criar `apps/web/src/components/patients/food-recall-editor.tsx` (`'use client'`; espelha `meal-plan-editor.tsx` **sem** `OptionCard` — refeições contêm itens diretamente; `+ recallDate + notes`; totais somam todos os itens vs. a última Meta):
```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  useFieldArray, useForm, useWatch, type Control, type Path, type Resolver, type UseFormRegister, type UseFormSetValue,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { Food, FoodRecall } from '@nutri-plus/shared-types';
import { macrosForPortion } from '@nutri-plus/shared-types';
import { foodRecallSchema, type FoodRecallFormValues } from '@/lib/validation/food-recall';
import {
  useCreateFoodRecall, useDeleteFoodRecall, useFoodRecall, useUpdateFoodRecall,
} from '@/lib/queries/food-recalls';
import { useNutritionTargets } from '@/lib/queries/nutrition-targets';
import { ApiError } from '@/lib/api/client';
import { FoodPickerDialog } from '@/components/patients/food-picker-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

type ItemValues = { foodName: string; foodId: string; quantity: string; grams: string; calories: string; protein: string; carbs: string; fats: string; fiber: string; sodium: string };
type MealValues = { name: string; timeLabel: string; items: ItemValues[] };
type FormValues = { recallDate: string; notes: string; meals: MealValues[] };

const blankItem = (): ItemValues => ({ foodName: '', foodId: '', quantity: '', grams: '', calories: '', protein: '', carbs: '', fats: '', fiber: '', sodium: '' });
const blankMeal = (): MealValues => ({ name: '', timeLabel: '', items: [blankItem()] });
const numToStr = (n: number | null) => (n == null ? '' : String(n));
const dateInput = (iso: string) => new Date(iso).toISOString().slice(0, 10);

function blankDefaults(): FormValues {
  return { recallDate: new Date().toISOString().slice(0, 10), notes: '', meals: [blankMeal()] };
}
function toDefaults(r: FoodRecall): FormValues {
  return {
    recallDate: dateInput(r.recallDate),
    notes: r.notes ?? '',
    meals: r.meals.map((m) => ({
      name: m.name ?? '', timeLabel: m.timeLabel ?? '',
      items: m.items.map((it) => ({
        foodName: it.foodName ?? '', foodId: it.foodId ?? '', quantity: it.quantity ?? '',
        grams: numToStr(it.grams), calories: numToStr(it.calories), protein: numToStr(it.protein),
        carbs: numToStr(it.carbs), fats: numToStr(it.fats), fiber: numToStr(it.fiber), sodium: numToStr(it.sodium),
      })),
    })),
  };
}

const ITEM_MACROS = [
  { key: 'calories', label: 'Kcal' }, { key: 'protein', label: 'P' }, { key: 'carbs', label: 'C' },
  { key: 'fats', label: 'G' }, { key: 'fiber', label: 'Fib' }, { key: 'sodium', label: 'Na' },
] as const;
type MacroKey = (typeof ITEM_MACROS)[number]['key'];
const GROW_SM = 'min-h-7 resize-none py-1';

function sum(values: string[]): number {
  return values.reduce((acc, v) => acc + (Number(v) || 0), 0);
}

export function FoodRecallEditor({ patientId, recallId, canEdit = true }: { patientId: string; recallId?: string; canEdit?: boolean }) {
  const isCreate = !recallId;
  const query = useFoodRecall(recallId ?? '');
  const create = useCreateFoodRecall(patientId);
  const update = useUpdateFoodRecall(patientId);
  const remove = useDeleteFoodRecall(patientId);
  const targets = useNutritionTargets(patientId);
  const latest = targets.data?.[0];
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(foodRecallSchema) as unknown as Resolver<FormValues>,
    defaultValues: blankDefaults(),
  });
  const meals = useFieldArray({ control: form.control, name: 'meals' });

  useEffect(() => {
    if (!isCreate && query.data) form.reset(toDefaults(query.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const watched = form.watch('meals');
  function totalFor(macro: MacroKey): number {
    return sum((watched ?? []).flatMap((m) => (m.items ?? []).map((it) => it[macro])));
  }
  const META: Partial<Record<MacroKey, number | undefined>> = {
    calories: latest?.targetCalories, protein: latest?.proteinGrams, carbs: latest?.carbGrams, fats: latest?.fatGrams,
  };

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      if (isCreate) {
        const created = await create.mutateAsync({ patientId, ...(values as never) });
        toast.success('Recordatório criado.');
        router.replace(`/patients/${patientId}/recordatorios/${created.id}`);
      } else {
        await update.mutateAsync({ id: recallId!, body: values as never });
        toast.success('Recordatório salvo.');
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? 'Não foi possível salvar.' : 'Erro inesperado.');
    }
  }
  async function onDelete() {
    if (isCreate) return;
    try {
      await remove.mutateAsync(recallId!);
      toast.success('Recordatório excluído.');
      router.push(`/patients/${patientId}`);
    } catch {
      toast.error('Não foi possível excluir.');
    }
  }

  if (!isCreate && query.isLoading) return <Skeleton className="h-64 w-full max-w-4xl" />;

  const pending = form.formState.isSubmitting || create.isPending || update.isPending;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href={`/patients/${patientId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao paciente
      </Link>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Data do recordatório</span>
              <Input type="date" {...form.register('recallDate')} />
            </label>
            <label className="min-w-60 flex-1 text-sm">
              <span className="mb-1 block text-muted-foreground">Observações</span>
              <Textarea rows={1} className={GROW_SM} {...form.register('notes')} />
            </label>
          </div>

          {/* Totals bar (all items) vs the latest Meta */}
          <div className="sticky top-0 z-10 flex flex-wrap gap-4 rounded-xl border bg-card p-3">
            {ITEM_MACROS.map((m) => {
              const total = totalFor(m.key);
              const meta = META[m.key];
              return (
                <div key={m.key} className="text-center">
                  <b data-testid={`total-${m.key}`} className="block text-sm">
                    {total}{meta ? <span className="text-muted-foreground">/{meta}</span> : null}
                  </b>
                  <span className="text-[10px] text-muted-foreground">{m.label}</span>
                </div>
              );
            })}
          </div>

          {meals.fields.map((mealField, mealIndex) => (
            <MealCard
              key={mealField.id}
              control={form.control}
              register={form.register}
              setValue={form.setValue}
              mealIndex={mealIndex}
              canEdit={canEdit}
              onRemove={() => meals.remove(mealIndex)}
            />
          ))}
          {canEdit && (
            <Button type="button" variant="outline" className="rounded-full" onClick={() => meals.append(blankMeal())}>
              + Adicionar refeição
            </Button>
          )}
        </fieldset>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        {canEdit && (
          <div className="flex items-center gap-2 border-t pt-4">
            {!isCreate && (
              <Button type="button" variant="outline" className="mr-auto rounded-full text-destructive" onClick={onDelete} disabled={remove.isPending}>
                Excluir
              </Button>
            )}
            <Button type="submit" className="rounded-full" disabled={pending}>
              {pending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}

function MealCard({
  control, register, setValue, mealIndex, canEdit, onRemove,
}: {
  control: Control<FormValues>; register: UseFormRegister<FormValues>; setValue: UseFormSetValue<FormValues>;
  mealIndex: number; canEdit: boolean; onRemove: () => void;
}) {
  const items = useFieldArray({ control, name: `meals.${mealIndex}.items` as const });
  const watchedItems = useWatch({ control, name: `meals.${mealIndex}.items` }) as ItemValues[] | undefined;
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const foodCache = useRef<Record<string, Food>>({});

  const setField = (itemIndex: number, field: string, value: string) =>
    setValue(`meals.${mealIndex}.items.${itemIndex}.${field}` as Path<FormValues>, value);
  function fillMacros(itemIndex: number, food: Food, grams: number) {
    const m = macrosForPortion(food, grams);
    setField(itemIndex, 'calories', String(m.calories)); setField(itemIndex, 'protein', String(m.protein));
    setField(itemIndex, 'carbs', String(m.carbs)); setField(itemIndex, 'fats', String(m.fats));
    setField(itemIndex, 'fiber', String(m.fiber)); setField(itemIndex, 'sodium', String(m.sodium));
  }
  function onPickFood(itemIndex: number, food: Food) {
    foodCache.current[food.id] = food;
    setField(itemIndex, 'foodId', food.id); setField(itemIndex, 'foodName', food.name);
    const gramsStr = (watchedItems?.[itemIndex]?.grams ?? '').trim();
    const grams = Number(gramsStr) || 100;
    if (!gramsStr) setField(itemIndex, 'grams', '100');
    fillMacros(itemIndex, food, grams);
  }
  function onGramsChange(itemIndex: number, value: string) {
    setField(itemIndex, 'grams', value);
    const foodId = watchedItems?.[itemIndex]?.foodId;
    const food = foodId ? foodCache.current[foodId] : undefined;
    const grams = Number(value);
    if (food && grams > 0) fillMacros(itemIndex, food, grams);
  }
  const subtotal = (macro: MacroKey) => sum((watchedItems ?? []).map((it) => it[macro]));

  return (
    <div data-testid="recall-meal-card" className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Textarea rows={1} className={`max-w-48 ${GROW_SM}`} placeholder="Refeição" aria-label="Nome da refeição" {...register(`meals.${mealIndex}.name`)} />
        <Textarea rows={1} className={`max-w-28 ${GROW_SM}`} placeholder="08:00" aria-label="Horário" {...register(`meals.${mealIndex}.timeLabel`)} />
        {canEdit && (
          <Button type="button" variant="outline" size="sm" className="ml-auto rounded-full text-destructive" onClick={onRemove} aria-label="Remover refeição">✕</Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase text-muted-foreground">
              {canEdit && <th />}
              <th className="py-1">Alimento</th><th className="py-1">Qtd</th><th className="py-1">Gramas</th>
              {ITEM_MACROS.map((m) => <th key={m.key} className="py-1">{m.label}</th>)}
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {items.fields.map((itemField, itemIndex) => (
              <tr key={itemField.id}>
                {canEdit && (
                  <td className="py-1 pr-1 align-top">
                    <Button type="button" variant="outline" size="sm" className="rounded-full" aria-label="Buscar alimento" onClick={() => setPickerFor(itemIndex)}>🔍</Button>
                  </td>
                )}
                <td className="py-1 pr-1 align-top"><Textarea rows={1} className={`w-48 ${GROW_SM}`} aria-label="Alimento" {...register(`meals.${mealIndex}.items.${itemIndex}.foodName`)} /></td>
                <td className="py-1 pr-1 align-top"><Textarea rows={1} className={`w-24 ${GROW_SM}`} aria-label="Quantidade" {...register(`meals.${mealIndex}.items.${itemIndex}.quantity`)} /></td>
                <td className="py-1 pr-1 align-top">
                  <Input className="h-7 w-16" type="number" inputMode="decimal" step="any" aria-label="Gramas"
                    value={watchedItems?.[itemIndex]?.grams ?? ''} onChange={(e) => onGramsChange(itemIndex, e.target.value)} />
                </td>
                {ITEM_MACROS.map((m) => (
                  <td key={m.key} className="py-1 pr-1 align-top">
                    <Input className="h-7 w-16" type="number" inputMode="decimal" step="any" aria-label={m.label}
                      {...register(`meals.${mealIndex}.items.${itemIndex}.${m.key}` as const)} />
                  </td>
                ))}
                {canEdit && (
                  <td className="py-1 align-top">
                    <Button type="button" variant="outline" size="sm" className="rounded-full text-destructive" onClick={() => items.remove(itemIndex)} aria-label="Remover item">✕</Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {ITEM_MACROS.map((m) => <span key={m.key} data-testid={`meal-subtotal-${m.key}`}>{m.label} {subtotal(m.key)}</span>)}
      </div>
      {canEdit && (
        <button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={() => items.append(blankItem())}>+ Adicionar item</button>
      )}
      <FoodPickerDialog
        open={pickerFor !== null}
        onOpenChange={(o) => { if (!o) setPickerFor(null); }}
        onPick={(food) => { if (pickerFor !== null) onPickFood(pickerFor, food); setPickerFor(null); }}
      />
    </div>
  );
}
```
(Se o tsc reclamar do path dinâmico no `setValue`, o cast `as Path<FormValues>` já é usado — mesmo padrão do `meal-plan-editor`.)
Run: `pnpm --filter @nutri-plus/web test -- food-recall-editor` → PASS.

- [ ] **Step 4: Verificação + commit**

Run: `pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit` (verde; tsc 0).
```bash
git add apps/web/src/lib/api/food-recalls.ts apps/web/src/lib/queries/food-recalls.ts apps/web/src/lib/validation/food-recall.ts apps/web/src/components/patients/food-recall-editor.tsx apps/web/src/components/patients/food-recall-editor.test.tsx
git commit -m "feat(web): food recall editor (foods + grams -> macros vs meta)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Web — seção Recordatório + páginas roteadas + aba

**Files:** Create `apps/web/src/components/patients/recordatorio-section.tsx` (+ test), `app/(app)/patients/[id]/recordatorios/novo/page.tsx`, `app/(app)/patients/[id]/recordatorios/[recallId]/page.tsx`; Modify `apps/web/src/components/patients/patient-detail.tsx`.

**Interfaces:** Consumes `useFoodRecalls`, `FoodRecallSummary`, `FoodRecallEditor`. Produces `<RecordatorioSection patientId canEdit />` + a aba + as páginas do editor.

- [ ] **Step 1: Páginas roteadas** — criar `apps/web/src/app/(app)/patients/[id]/recordatorios/novo/page.tsx` (mirar `planos/novo/page.tsx`):
```tsx
import { FoodRecallEditor } from '@/components/patients/food-recall-editor';
import { Unauthorized } from '@/components/auth/unauthorized';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManagePatients } from '@/lib/auth/access';

export default async function NewFoodRecallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me || !canManagePatients(me.role)) return <Unauthorized />;
  return <FoodRecallEditor patientId={id} canEdit />;
}
```
Criar `apps/web/src/app/(app)/patients/[id]/recordatorios/[recallId]/page.tsx` (mirar `planos/[planId]/page.tsx`):
```tsx
import { FoodRecallEditor } from '@/components/patients/food-recall-editor';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManagePatients } from '@/lib/auth/access';

export default async function FoodRecallPage({ params }: { params: Promise<{ id: string; recallId: string }> }) {
  const { id, recallId } = await params;
  const me = await getCurrentUser();
  const canEdit = !!me && canManagePatients(me.role);
  return <FoodRecallEditor patientId={id} recallId={recallId} canEdit={canEdit} />;
}
```

- [ ] **Step 2: Teste que falha (vitest)** — criar `apps/web/src/components/patients/recordatorio-section.test.tsx`: mockar `@/lib/queries/food-recalls` (`useFoodRecalls` → dois resumos com `recallDate`); renderizar `<RecordatorioSection patientId="p1" canEdit />`; asseverar que as datas aparecem e que há o link "Novo recordatório" (só com `canEdit`); com `canEdit={false}` o botão "Novo" some. Run → FAIL.

- [ ] **Step 3: Section** — criar `apps/web/src/components/patients/recordatorio-section.tsx` (mirar `meal-plans-section.tsx`):
```tsx
'use client';

import Link from 'next/link';
import type { FoodRecallSummary } from '@nutri-plus/shared-types';
import { useFoodRecalls } from '@/lib/queries/food-recalls';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function RecordatorioSection({ patientId, canEdit = true }: { patientId: string; canEdit?: boolean }) {
  const query = useFoodRecalls(patientId);
  const recalls = query.data ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-bold">Recordatórios 24h</h2>
        {canEdit && (
          <Button variant="outline" size="sm" className="rounded-full" asChild>
            <Link href={`/patients/${patientId}/recordatorios/novo`}>Novo recordatório</Link>
          </Button>
        )}
      </div>

      {query.isLoading && (
        <div data-testid="recalls-loading" className="rounded-xl border bg-card p-4"><Skeleton className="h-16 w-full" /></div>
      )}
      {query.isError && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar.{' '}
          <button onClick={() => query.refetch()} className="font-semibold text-primary hover:underline">Tentar de novo</button>
        </div>
      )}
      {query.data && recalls.length === 0 && (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum recordatório ainda.
        </div>
      )}
      {recalls.length > 0 && (
        <div className="space-y-2">
          {recalls.map((r: FoodRecallSummary) => (
            <Link key={r.id} href={`/patients/${patientId}/recordatorios/${r.id}`}
              className="flex items-center justify-between rounded-xl border bg-card p-4 hover:bg-muted/40">
              <span className="font-medium">{formatDate(r.recallDate)}</span>
              {r.notes ? <span className="truncate text-sm text-muted-foreground">{r.notes}</span> : null}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
```
Run: `pnpm --filter @nutri-plus/web test -- recordatorio-section` → PASS.

- [ ] **Step 4: Aba no patient-detail** — em `apps/web/src/components/patients/patient-detail.tsx`: importar `RecordatorioSection`; adicionar `<TabsTrigger value="recordatorio">Recordatório</TabsTrigger>` após "planos"; e:
```tsx
        <TabsContent value="recordatorio">
          <RecordatorioSection patientId={patient.id} canEdit={canEdit} />
        </TabsContent>
```

- [ ] **Step 5: Verificação de todas as áreas + commit**

Run:
```
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```
Expected: tudo verde (mobile tsc confirma que os shared-types novos não quebram — aditivo).
```bash
git add apps/web/src/components/patients/recordatorio-section.tsx apps/web/src/components/patients/recordatorio-section.test.tsx "apps/web/src/app/(app)/patients/[id]/recordatorios" apps/web/src/components/patients/patient-detail.tsx
git commit -m "feat(web): recordatório section + routed editor pages + tab

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificação final

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```

Manual (dev DB + paciente do nutri, de preferência com uma Meta salva): aba **Recordatório** → "Novo recordatório" → escolher a data, adicionar refeições + itens (buscar alimento + gramas → macros preenchem; texto-livre também funciona) → a barra de totais soma tudo e mostra vs. a Meta → "Salvar" navega pro recordatório salvo → reabrir mantém → Excluir remove.

## Notas

- Servidor grava os macros do editor (client-side, como A2); o recálculo por-sessão do picker de gramas segue a mesma limitação conhecida do A2 (sem `GET /foods/:id`).
- `RecallItem`/`RecallMeal`/`FoodRecall` são Cascade → a exclusão de conta (C2) já os remove; nenhuma mudança na erasure.
