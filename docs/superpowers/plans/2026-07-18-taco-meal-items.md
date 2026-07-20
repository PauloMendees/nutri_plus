# Itens de Refeição baseados em Alimentos + Plano vs. Meta (A2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o nutricionista montar itens do plano a partir de alimentos reais do catálogo TACO (via `FoodSearch`) com porção em gramas → macros calculados automaticamente (editáveis), incluir fibra/sódio no editor + PDF, e puxar as metas do plano da última `NutritionTarget` do paciente.

**Architecture:** Aditivo/retrocompatível. `MealItem` ganha `foodId/grams/fiber/sodium` (todos nullable). Uma função pura `macrosForPortion(food, grams)` no `shared-types` calcula os macros no preview do editor web; o server grava o que o editor envia (arquitetura atual — o cálculo autoritativo server-side fica para o A3). Itens sem `foodId` continuam sendo texto livre + macros manuais (comportamento de hoje, e o que a IA gera). O PDF recebe o row do banco por cast estrutural, então basta estender a interface + a tabela.

**Tech Stack:** NestJS + Prisma 7 (`@prisma/adapter-pg`) + Supabase Postgres; Next.js 16 + react-hook-form + zod + react-query + shadcn; Expo; `@nutri-plus/shared-types` (tsc build, sem runner). Testes: API+mobile JEST, web vitest.

## Global Constraints

- Migração **aditiva** na dev DB compartilhada (`prisma migrate dev`; `prisma generate` se preciso). shared-types reconstruído após mudança de tipo. **Sem novas dependências.** pt-BR.
- Aditivo/retrocompatível: itens sem `foodId` = texto livre + macros manuais (hoje, e o que a IA gera). Nada de switch destrutivo, nenhuma migração de dados existentes.
- Server **grava o que o editor envia** (arquitetura atual; cálculo autoritativo server-side fica para o A3). O cálculo puro (`macrosForPortion`) vive no shared-types e é a fonte única do preview web.
- Fibra/sódio entram no **editor web + PDF**; **sem meta** para fibra/sódio (o `NutritionTarget` só tem kcal/P/C/G). A barra total/meta continua comparando só os 4 macros.
- **Mobile:** só o tipo aditivo; `meal-plan-view.tsx` **inalterado** (só kcal por item). `tsc` limpo.
- "Usar Meta atual" reusa `GET /v1/patients/:id/nutrition-targets` (ordenado `targetDate desc` → o primeiro é o mais recente) via o hook `useNutritionTargets` já existente.
- Combinar estilo de aspas por arquivo (api aspas simples; web por arquivo). Testes API+mobile **JEST** / web **vitest**.
- Trailer de commit `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **NÃO** dar push/PR (a branch `feat/taco-food-database` já tem o PR #46; commits ficam locais). Ficar em `feat/taco-food-database`.
- Verificar por área: shared-types `build`; API `test` + `tsc --noEmit`; web `test` + `tsc --noEmit`; mobile `tsc --noEmit`.

## File Structure

- `packages/shared-types/src/v1/meal-plan.ts` — `MealItem`/`MealItemInput` ganham `foodId/grams/fiber/sodium`.
- `packages/shared-types/src/v1/food-portion.ts` (novo) — `macrosForPortion` puro + `PortionMacros`.
- `packages/shared-types/src/v1/index.ts` — exporta `food-portion`.
- `apps/api/src/meal-plans/food-portion.spec.ts` (novo) — jest do cálculo puro (importa de `@nutri-plus/shared-types`, espelha `nutrition-targets/energy.spec.ts`).
- `apps/api/prisma/schema.prisma` + migração — `MealItem += foodId/grams/fiber/sodium` + relação; `Food += mealItems` (back-relation).
- `apps/api/src/meal-plans/dto/meal-item.dto.ts` — +4 campos.
- `apps/api/src/meal-plans/meal-plans.service.ts` — validação `foodId` em lote (`assertFoodsExist`).
- `apps/api/src/meal-plans/meal-plans.service.spec.ts` — persistência + `foodId` inválido → 400.
- `apps/api/src/meal-plans/pdf/meal-plan-doc.ts` + `.spec.ts` — colunas Fibra/Sódio.
- `apps/web/src/lib/validation/meal-plan.ts` — schema dos campos novos.
- `apps/web/src/components/patients/meal-plan-editor.tsx` — fibra/sódio nas colunas/subtotais/total, "Usar Meta atual", picker de alimento + gramas + auto-cálculo.
- `apps/web/src/components/patients/food-picker-dialog.tsx` (novo) — Dialog + `FoodSearch`.
- `apps/web/src/components/patients/meal-plan-editor.test.tsx` — testes novos.

---

### Task 1: shared-types — campos do item + cálculo `macrosForPortion`

**Files:**
- Modify: `packages/shared-types/src/v1/meal-plan.ts`
- Create: `packages/shared-types/src/v1/food-portion.ts`
- Modify: `packages/shared-types/src/v1/index.ts`
- Test: `apps/api/src/meal-plans/food-portion.spec.ts` (jest via API suite — shared-types não tem runner; espelha `apps/api/src/nutrition-targets/energy.spec.ts`)

**Interfaces:**
- Consumes: `Food` (de `./food`: `energyKcal/protein/carbohydrate/lipid/fiber/sodium: number | null`).
- Produces: `macrosForPortion(food, grams): PortionMacros`; `MealItem`/`MealItemInput` com `foodId/grams/fiber/sodium`.

- [ ] **Step 1: Escrever o teste que falha** — `apps/api/src/meal-plans/food-portion.spec.ts`

```ts
import { macrosForPortion } from '@nutri-plus/shared-types';

describe('macrosForPortion', () => {
  const arrozIntegral = {
    energyKcal: 124,
    protein: 2.6,
    carbohydrate: 25.8,
    lipid: 1,
    fiber: 2.7,
    sodium: 1.2,
  };

  it('escala os nutrientes por 100 g e arredonda para inteiro', () => {
    expect(macrosForPortion(arrozIntegral, 150)).toEqual({
      calories: 186, // 124 * 1.5
      protein: 4, //   2.6 * 1.5 = 3.9 -> 4
      carbs: 39, //    25.8 * 1.5 = 38.7 -> 39
      fats: 2, //      1 * 1.5 = 1.5 -> 2
      fiber: 4, //     2.7 * 1.5 = 4.05 -> 4
      sodium: 2, //    1.2 * 1.5 = 1.8 -> 2
    });
  });

  it('trata nutriente null como 0', () => {
    expect(
      macrosForPortion(
        { energyKcal: 100, protein: null, carbohydrate: null, lipid: null, fiber: null, sodium: null },
        200,
      ),
    ).toEqual({ calories: 200, protein: 0, carbs: 0, fats: 0, fiber: 0, sodium: 0 });
  });

  it('retorna tudo 0 para 0 g', () => {
    expect(macrosForPortion(arrozIntegral, 0)).toEqual({
      calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sodium: 0,
    });
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm --filter @nutri-plus/api test -- food-portion`
Expected: FAIL na compilação — `macrosForPortion` não é exportado de `@nutri-plus/shared-types`.

- [ ] **Step 3: Implementar o cálculo** — criar `packages/shared-types/src/v1/food-portion.ts`

```ts
import type { Food } from './food';

export interface PortionMacros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  sodium: number;
}

// Nutrientes do catálogo são por 100 g (null = não disponível → tratado como 0).
// Arredonda cada valor para inteiro (casa com o visual do plano). Fonte única do
// preview do editor web; disponível para o A3 usar server-side.
export function macrosForPortion(
  food: Pick<Food, 'energyKcal' | 'protein' | 'carbohydrate' | 'lipid' | 'fiber' | 'sodium'>,
  grams: number,
): PortionMacros {
  const scale = (v: number | null) => Math.round((v ?? 0) * grams / 100);
  return {
    calories: scale(food.energyKcal),
    protein: scale(food.protein),
    carbs: scale(food.carbohydrate),
    fats: scale(food.lipid),
    fiber: scale(food.fiber),
    sodium: scale(food.sodium),
  };
}
```

- [ ] **Step 4: Adicionar os campos ao `MealItem`/`MealItemInput`** — `packages/shared-types/src/v1/meal-plan.ts`

No `interface MealItem`, depois de `fats: number | null;` e antes de `order: number;`, adicionar:
```ts
  foodId: string | null;
  grams: number | null;
  fiber: number | null;
  sodium: number | null;
```
No `interface MealItemInput`, depois de `fats?: number;`, adicionar:
```ts
  foodId?: string;
  grams?: number;
  fiber?: number;
  sodium?: number;
```

- [ ] **Step 5: Exportar** — em `packages/shared-types/src/v1/index.ts`, adicionar após `export * from './food';`:
```ts
export * from './food-portion';
```

- [ ] **Step 6: Build do shared-types e rodar o teste (verde)**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: sem erros.
Run: `pnpm --filter @nutri-plus/api test -- food-portion`
Expected: PASS (3 testes).

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types/src/v1/meal-plan.ts packages/shared-types/src/v1/food-portion.ts packages/shared-types/src/v1/index.ts apps/api/src/meal-plans/food-portion.spec.ts
git commit -m "feat(shared-types): meal item food fields + macrosForPortion calc

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Prisma migração + API (DTO + validação de `foodId`)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (+ migração gerada)
- Modify: `apps/api/src/meal-plans/dto/meal-item.dto.ts`
- Modify: `apps/api/src/meal-plans/meal-plans.service.ts`
- Test: `apps/api/src/meal-plans/meal-plans.service.spec.ts`

**Interfaces:**
- Consumes: `Food` (modelo do A1); `MealDto`/`MealOptionDto`/`MealItemDto` (existentes).
- Produces: `MealItem` persiste `foodId/grams/fiber/sodium`; `POST/PATCH` recusam `foodId` inexistente com 400.

- [ ] **Step 1: Migração aditiva** — em `apps/api/prisma/schema.prisma`, no `model MealItem`, depois de `fats Float?` e antes de `order Int`, adicionar:
```prisma
  foodId       String?
  food         Food?      @relation(fields: [foodId], references: [id], onDelete: SetNull)
  grams        Float?
  fiber        Float?
  sodium       Float?
```
No `model Food`, depois de `createdAt DateTime @default(now())` (antes do `@@index`), adicionar a back-relation (virtual — sem coluna):
```prisma
  mealItems    MealItem[]
```

- [ ] **Step 2: Gerar a migração + client**

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name meal_item_food_ref`
Expected: cria `apps/api/prisma/migrations/<timestamp>_meal_item_food_ref/migration.sql` com apenas `ALTER TABLE "MealItem" ADD COLUMN ...` (4 colunas) + a FK para `Food` — **nenhum** `DROP`/alteração de coluna existente. O client é regenerado.

- [ ] **Step 3: Teste que falha — persistir os campos novos** — em `apps/api/src/meal-plans/meal-plans.service.spec.ts`, adicionar um teste que cria um plano com um item referenciando um alimento. Mirar o padrão de mock de PrismaService já usado no arquivo (ler os testes existentes de `createPlan`). Asserção-chave: o `data` passado a `prisma.mealPlan.create` inclui, no item, `foodId`, `grams`, `fiber`, `sodium` (via o spread `...it`). Exemplo do corpo do item no dto:
```ts
{ foodName: 'Arroz integral', foodId: 'f-uuid-1', grams: 150, calories: 186, protein: 4, carbs: 39, fats: 2, fiber: 4, sodium: 2 }
```
Mockar `prisma.food.findMany` para retornar `[{ id: 'f-uuid-1' }]` (a validação de existência passa).

- [ ] **Step 4: Teste que falha — `foodId` inexistente → 400** — adicionar um teste: dto com um item `{ foodId: 'nope' }`; `prisma.food.findMany` mockado retornando `[]`; esperar `BadRequestException` (o `create` do prisma **não** é chamado).

- [ ] **Step 5: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/api test -- meal-plans.service`
Expected: FAIL (os campos novos não são whitelisted no DTO ainda; não há validação de `foodId`).

- [ ] **Step 6: Adicionar os campos ao DTO** — em `apps/api/src/meal-plans/dto/meal-item.dto.ts`, trocar o import e adicionar 4 campos:

Import (topo):
```ts
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
```
Dentro da classe `MealItemDto`, depois do campo `fats`:
```ts
  @IsOptional()
  @IsUUID()
  foodId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  grams?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fiber?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sodium?: number;
```

- [ ] **Step 7: Validar `foodId` em lote no service** — em `apps/api/src/meal-plans/meal-plans.service.ts`:

Adicionar `BadRequestException` ao import do `@nestjs/common`:
```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
```
Adicionar o helper privado (perto de `mealsCreateInput`):
```ts
  // Recusa (400) qualquer foodId de item que não exista no catálogo global Food —
  // evita referência pendente e o 500 de FK. Itens sem foodId (texto livre) passam.
  private async assertFoodsExist(meals: MealDto[]): Promise<void> {
    const ids = [
      ...new Set(
        meals
          .flatMap((m) => m.options ?? [])
          .flatMap((o) => o.items ?? [])
          .map((it) => it.foodId)
          .filter((id): id is string => !!id),
      ),
    ];
    if (ids.length === 0) return;
    const found = await this.prisma.food.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('Alimento inexistente referenciado no plano.');
    }
  }
```
Em `createPlan`, antes do `return this.prisma.mealPlan.create(...)`:
```ts
    if (meals) await this.assertFoodsExist(meals);
```
Em `updatePlan`, no ramo com `meals` presente (antes do `$transaction`):
```ts
    await this.assertFoodsExist(meals);
```
(O spread `...it` em `mealsCreateInput` já persiste `foodId/grams/fiber/sodium` — nenhuma outra mudança.)

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @nutri-plus/api test -- meal-plans.service`
Expected: PASS (incluindo os 2 testes novos).

- [ ] **Step 9: Verificação da área + commit**

Run: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: suíte verde; `tsc` exit 0.
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/meal-plans/dto/meal-item.dto.ts apps/api/src/meal-plans/meal-plans.service.ts apps/api/src/meal-plans/meal-plans.service.spec.ts
git commit -m "feat(api): meal item food ref (foodId/grams/fiber/sodium) + validation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: PDF — colunas Fibra e Sódio

**Files:**
- Modify: `apps/api/src/meal-plans/pdf/meal-plan-doc.ts`
- Test: `apps/api/src/meal-plans/pdf/meal-plan-doc.spec.ts`

**Interfaces:**
- Consumes: `PdfMealPlan` recebe o row do banco por cast estrutural (o `MealItemPdf` lê `it.fiber`/`it.sodium` que agora existem no banco — Task 2).
- Produces: tabela de item com colunas Fibra/Sódio + subtotal.

- [ ] **Step 1: Teste que falha** — em `apps/api/src/meal-plans/pdf/meal-plan-doc.spec.ts`, estender o(s) fixture(s) `PdfMealItem` com `fiber`/`sodium` e adicionar uma asserção de que o doc contém os cabeçalhos `'Fibra'` e `'Sódio'` e os valores no subtotal. Ler o spec atual para casar o estilo de asserção (ele inspeciona a estrutura `content`/`table`). Exemplo de item no fixture:
```ts
{ foodName: 'Arroz', quantity: '150 g', calories: 186, protein: 4, carbs: 39, fats: 2, fiber: 4, sodium: 2 }
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @nutri-plus/api test -- meal-plan-doc`
Expected: FAIL (tsc: `fiber`/`sodium` não existem em `PdfMealItem`; e/ou asserção de cabeçalho falha).

- [ ] **Step 3: Estender a interface e a tabela** — em `apps/api/src/meal-plans/pdf/meal-plan-doc.ts`:

Em `interface PdfMealItem`, adicionar após `fats: number | null;`:
```ts
  fiber: number | null;
  sodium: number | null;
```
No cabeçalho da tabela de itens (o array `rows` inicial), adicionar duas colunas após `{ text: 'G', style: 'th' }`:
```ts
          { text: 'Fibra', style: 'th' },
          { text: 'Sódio', style: 'th' },
```
No acumulador de subtotal, adicionar campos: trocar `const sub = { c: 0, p: 0, cb: 0, f: 0 };` por:
```ts
      const sub = { c: 0, p: 0, cb: 0, f: 0, fb: 0, s: 0 };
```
No `option.items.forEach`, após `sub.f += num(it.fats);`:
```ts
        sub.fb += num(it.fiber);
        sub.s += num(it.sodium);
```
E na linha de item (`rows.push([...])`), após `{ text: String(num(it.fats)) },`:
```ts
          { text: String(num(it.fiber)) },
          { text: String(num(it.sodium)) },
```
Na linha de subtotal, após `{ text: String(sub.f), style: 'subtotal' },`:
```ts
        { text: String(sub.fb), style: 'subtotal' },
        { text: String(sub.s), style: 'subtotal' },
```
E ajustar o `widths` da tabela de itens (era 6 colunas) para 8:
```ts
        table: { widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'], body: rows },
```
(A tabela de **metas** do topo continua só com os 4 macros — não mexer nela.)

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @nutri-plus/api test -- meal-plan-doc`
Expected: PASS.

- [ ] **Step 5: Verificação da área + commit**

Run: `pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: verde; `tsc` exit 0.
```bash
git add apps/api/src/meal-plans/pdf/meal-plan-doc.ts apps/api/src/meal-plans/pdf/meal-plan-doc.spec.ts
git commit -m "feat(api): fiber + sodium columns in meal-plan PDF

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Web — fibra/sódio no editor + "Usar Meta atual"

**Files:**
- Modify: `apps/web/src/lib/validation/meal-plan.ts`
- Modify: `apps/web/src/components/patients/meal-plan-editor.tsx`
- Test: `apps/web/src/components/patients/meal-plan-editor.test.tsx`

**Interfaces:**
- Consumes: `useNutritionTargets(patientId)` (de `@/lib/queries/nutrition-targets` — retorna `NutritionTarget[]` em `targetDate desc`); `MealItemInput` estendido (Task 1).
- Produces: colunas/subtotais/total com fibra+sódio; campos de item `foodId/grams/fiber/sodium` no form; botão "Usar Meta atual". Consumido pela Task 5 (que adiciona o picker no mesmo item-row + a coluna Gramas).

- [ ] **Step 1: Schema zod dos campos novos** — em `apps/web/src/lib/validation/meal-plan.ts`, no `mealItemSchema`, adicionar (após `fats: optNum,`):
```ts
  foodId: z.preprocess(emptyToUndefined, z.string().optional()),
  grams: optNum,
  fiber: optNum,
  sodium: optNum,
```

- [ ] **Step 2: Teste que falha (vitest)** — em `apps/web/src/components/patients/meal-plan-editor.test.tsx`:

(a) No fixture `plan`, no item `it1`, adicionar `fiber: 3, sodium: 5` (e opcionalmente `foodId: null, grams: null` — o form lê com optional-chaining, mas explicitar ajuda a legibilidade).
(b) Adicionar um teste do total de fibra/sódio: o editor mostra `total-fiber` com `3` e `total-sodium` com `5` (item único). 
(c) Adicionar um teste do "Usar Meta atual": mockar `@/lib/queries/nutrition-targets` para `useNutritionTargets` retornar `{ data: [{ targetCalories: 2000, proteinGrams: 150, carbGrams: 200, fatGrams: 55 }] }`; clicar no botão "Usar Meta atual"; esperar que os inputs de meta fiquem `2000/150/200/55`. Mock:
```ts
vi.mock('@/lib/queries/nutrition-targets', () => ({
  useNutritionTargets: () => ({ data: [{ targetCalories: 2000, proteinGrams: 150, carbGrams: 200, fatGrams: 55 }] }),
}));
```

Run: `pnpm --filter @nutri-plus/web test -- meal-plan-editor` → FAIL.

- [ ] **Step 3: Estender o form com os campos do item** — em `apps/web/src/components/patients/meal-plan-editor.tsx`:

`ItemValues` (linha ~33) passa a:
```ts
type ItemValues = { foodName: string; foodId: string; quantity: string; grams: string; calories: string; protein: string; carbs: string; fats: string; fiber: string; sodium: string };
```
`blankItem` (linha ~45):
```ts
const blankItem = (): ItemValues => ({ foodName: '', foodId: '', quantity: '', grams: '', calories: '', protein: '', carbs: '', fats: '', fiber: '', sodium: '' });
```
Em `toDefaults` (mapeamento dos itens), adicionar aos campos do item:
```ts
          foodId: it.foodId ?? '',
          grams: numToStr(it.grams),
          fiber: numToStr(it.fiber),
          sodium: numToStr(it.sodium),
```
Em `draftToDefaults` (itens), adicionar:
```ts
          foodId: it.foodId ?? '',
          grams: numToStr(it.grams ?? null),
          fiber: numToStr(it.fiber ?? null),
          sodium: numToStr(it.sodium ?? null),
```

- [ ] **Step 4: Macros exibidos (6) vs. metas (4)** — em `meal-plan-editor.tsx`, trocar o array `ITEM_MACROS` por 6 entradas e manter `TARGETS` com 4:
```ts
const ITEM_MACROS = [
  { key: 'calories', label: 'Kcal' },
  { key: 'protein', label: 'P' },
  { key: 'carbs', label: 'C' },
  { key: 'fats', label: 'G' },
  { key: 'fiber', label: 'Fib' },
  { key: 'sodium', label: 'Na' },
] as const;

// macro -> chave de meta (só os 4 têm meta; fibra/sódio não).
const MACRO_TARGET: Partial<Record<(typeof ITEM_MACROS)[number]['key'], (typeof TARGETS)[number]['key']>> = {
  calories: 'targetCalories',
  protein: 'targetProtein',
  carbs: 'targetCarbs',
  fats: 'targetFats',
};
```
Alargar o tipo do `totalFor` e do `subtotal` para as 6 chaves:
```ts
type MacroKey = 'calories' | 'protein' | 'carbs' | 'fats' | 'fiber' | 'sodium';
```
Trocar a assinatura de `totalFor(macro: 'calories' | ...)` por `totalFor(macro: MacroKey)` e, no `OptionCard`, `subtotal(macro: MacroKey)`.

- [ ] **Step 5: Barra de totais (dia) com 6 macros, meta só nos 4** — substituir o bloco "Totals bar" (o `<div className="sticky top-0 ...">` que mapeia `TARGETS`) por um que mapeia `ITEM_MACROS`:
```tsx
          {/* Totals bar (first option per meal) */}
          <div className="sticky top-0 z-10 flex flex-wrap gap-4 rounded-xl border bg-card p-3">
            {ITEM_MACROS.map((m) => {
              const total = totalFor(m.key);
              const targetKey = MACRO_TARGET[m.key];
              const target = targetKey ? Number(form.watch(targetKey)) || 0 : 0;
              return (
                <div key={m.key} className="text-center">
                  <b data-testid={`total-${m.key}`} className="block text-sm">
                    {total}
                    {target > 0 && <span className="text-muted-foreground">/{target}</span>}
                  </b>
                  <span className="text-[10px] text-muted-foreground">{m.label}</span>
                </div>
              );
            })}
          </div>
```
(Isso mantém `data-testid="total-calories"` etc. e adiciona `total-fiber`/`total-sodium`.)

- [ ] **Step 6: Subtotal por opção com 6 macros** — no `OptionCard`, o bloco de subtotal (`<div className="mt-2 flex flex-wrap gap-3 ...">`) passa a mapear `ITEM_MACROS`:
```tsx
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {ITEM_MACROS.map((m) => (
          <span key={m.key} data-testid={`option-subtotal-${m.key}`}>
            {m.label} {subtotal(m.key)}
          </span>
        ))}
      </div>
```

- [ ] **Step 7: Colunas Fibra/Sódio na tabela de itens** — no `OptionCard`, o cabeçalho `<thead>` já tem `Kcal/P/C/G` via literais; troque as colunas de macro do cabeçalho e das linhas para serem dirigidas por `ITEM_MACROS`. No `<thead>`, substituir os `<th>` de macro (`Kcal/P/C/G`) por:
```tsx
              {ITEM_MACROS.map((m) => (
                <th key={m.key} className="py-1">{m.label}</th>
              ))}
```
A linha de item já itera `ITEM_MACROS.map((m) => (<td>...register(...${m.key})...</td>))` — como `ITEM_MACROS` agora tem 6 entradas, fibra e sódio ganham inputs automaticamente. (Confirmar que o `register` usa `...items.${itemIndex}.${m.key}` — já usa.)

- [ ] **Step 8: Botão "Usar Meta atual"** — no topo do arquivo, importar o hook:
```ts
import { useNutritionTargets } from '@/lib/queries/nutrition-targets';
```
Dentro do componente `MealPlanEditor`, após os outros hooks:
```ts
  const targetsQuery = useNutritionTargets(patientId);
  const latestTarget = targetsQuery.data?.[0];

  function applyLatestTarget() {
    if (!latestTarget) return;
    form.setValue('targetCalories', String(latestTarget.targetCalories));
    form.setValue('targetProtein', String(latestTarget.proteinGrams));
    form.setValue('targetCarbs', String(latestTarget.carbGrams));
    form.setValue('targetFats', String(latestTarget.fatGrams));
  }
```
No card "Metas (por dia)", adicionar o botão no cabeçalho do card (ao lado do `<p>` "Metas (por dia)"), visível só quando `canEdit`:
```tsx
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metas (por dia)</p>
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={applyLatestTarget}
                  disabled={!latestTarget}
                >
                  Usar Meta atual
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* ...TARGETS.map inalterado... */}
            </div>
          </div>
```

- [ ] **Step 9: Rodar e ver passar**

Run: `pnpm --filter @nutri-plus/web test -- meal-plan-editor`
Expected: PASS (incluindo os testes de fibra/sódio e "Usar Meta atual"). Ajustar quaisquer asserções de subtotal existentes que dependiam do texto antigo (`option-subtotal-calories` etc. mudaram de `{n} kcal`/`P {n}` para `{label} {n}` — atualizar as asserções antigas para o novo formato, mantendo os `data-testid`).

- [ ] **Step 10: Verificação da área + commit**

Run: `pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: verde; `tsc` exit 0.
```bash
git add apps/web/src/lib/validation/meal-plan.ts apps/web/src/components/patients/meal-plan-editor.tsx apps/web/src/components/patients/meal-plan-editor.test.tsx
git commit -m "feat(web): fiber/sodium in meal editor totals + 'Usar Meta atual'

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Web — picker de alimento + gramas + auto-cálculo

**Files:**
- Create: `apps/web/src/components/patients/food-picker-dialog.tsx`
- Modify: `apps/web/src/components/patients/meal-plan-editor.tsx`
- Test: `apps/web/src/components/patients/meal-plan-editor.test.tsx`

**Interfaces:**
- Consumes: `FoodSearch` (`{ onSelect?: (food: Food) => void; placeholder?: string }`, de `@/components/foods/food-search`); `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` (de `@/components/ui/dialog`); `macrosForPortion` + `Food` (de `@nutri-plus/shared-types`); os campos de item do form (Task 4).
- Produces: item pode ser preenchido a partir de um `Food` + gramas; macros calculados e editáveis; recálculo ao mudar as gramas de um alimento escolhido na sessão.

- [ ] **Step 1: `FoodPickerDialog`** — criar `apps/web/src/components/patients/food-picker-dialog.tsx`:
```tsx
'use client';

import type { Food } from '@nutri-plus/shared-types';
import { FoodSearch } from '@/components/foods/food-search';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function FoodPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (food: Food) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buscar alimento</DialogTitle>
        </DialogHeader>
        <FoodSearch
          onSelect={(food) => {
            onPick(food);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Teste que falha (vitest)** — em `apps/web/src/components/patients/meal-plan-editor.test.tsx`, adicionar um teste que:
- mocka `@/lib/queries/foods` para `useFoodSearch` retornar `{ data: [{ id: 'f1', name: 'Arroz integral cozido', group: 'Cereais', energyKcal: 124, protein: 2.6, carbohydrate: 25.8, lipid: 1, fiber: 2.7, sodium: 1.2 }], isLoading: false, isFetching: false }`;
- renderiza o editor em modo create (`<MealPlanEditor patientId="p1" canEdit />`);
- clica no botão "Buscar alimento" do primeiro item, clica no resultado "Arroz integral cozido";
- preenche o campo Gramas do item com `150`;
- espera que os inputs de macro do item fiquem `186/4/39/2/4/2` (kcal/P/C/G/fibra/sódio) e o `foodName` = "Arroz integral cozido".

Mock (junto dos outros `vi.mock` do arquivo):
```ts
vi.mock('@/lib/queries/foods', () => ({
  useFoodSearch: () => ({
    data: [{ id: 'f1', name: 'Arroz integral cozido', group: 'Cereais', energyKcal: 124, protein: 2.6, carbohydrate: 25.8, lipid: 1, fiber: 2.7, sodium: 1.2 }],
    isLoading: false,
    isFetching: false,
  }),
}));
```

Run: `pnpm --filter @nutri-plus/web test -- meal-plan-editor` → FAIL (não há botão/pikcer/gramas ainda).

- [ ] **Step 3: Cache de alimentos + handlers no `OptionCard`** — em `meal-plan-editor.tsx`, imports no topo:
```ts
import { useRef, useState } from 'react'; // (useState já é importado — garanta useRef também)
import type { Food } from '@nutri-plus/shared-types';
import { macrosForPortion } from '@nutri-plus/shared-types';
import { FoodPickerDialog } from '@/components/patients/food-picker-dialog';
```
Adicionar `type Path` ao import existente de `react-hook-form` (junto de `useFieldArray`, `useForm`, etc.).

O `OptionCard` recebe `register`/`control`; para `setValue` precisamos passá-lo. Adicionar `setValue: UseFormSetValue<FormValues>` às props do `OptionCard` e do `MealCard` (repasse). Adicionar `type UseFormSetValue` ao import de `react-hook-form`. No `MealPlanEditor`, passar `setValue={form.setValue}` no `<MealCard ... />`; no `MealCard`, passar `setValue={setValue}` no `<OptionCard ... />`.

Dentro do `OptionCard`, estado do picker + cache em memória (para recálculo ao mudar as gramas). Os paths dinâmicos do `setValue` usam cast `as Path<FormValues>` (mesma ideia dos `register(... as const)` existentes, mas robusto para nome de campo dinâmico):
```tsx
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const foodCache = useRef<Record<string, Food>>({});

  const setField = (itemIndex: number, field: string, value: string) =>
    setValue(
      `meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.${field}` as Path<FormValues>,
      value,
    );

  function fillMacros(itemIndex: number, food: Food, grams: number) {
    const m = macrosForPortion(food, grams);
    setField(itemIndex, 'calories', String(m.calories));
    setField(itemIndex, 'protein', String(m.protein));
    setField(itemIndex, 'carbs', String(m.carbs));
    setField(itemIndex, 'fats', String(m.fats));
    setField(itemIndex, 'fiber', String(m.fiber));
    setField(itemIndex, 'sodium', String(m.sodium));
  }

  function onPickFood(itemIndex: number, food: Food) {
    foodCache.current[food.id] = food;
    setField(itemIndex, 'foodId', food.id);
    setField(itemIndex, 'foodName', food.name);
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
```

- [ ] **Step 4: Botão "Buscar alimento" + coluna Gramas no item-row** — no `OptionCard`, na linha de item (`<tr>`), antes do `<td>` do `foodName`, adicionar uma célula com o botão do picker; e adicionar a coluna Gramas após a coluna "Qtd". No `<thead>`, inserir `<th>Ali.</th>`/`<th>Gramas</th>` nas posições correspondentes (antes de "Alimento" um th vazio para o botão, e "Gramas" após "Qtd"):

Cabeçalho (`<tr>` do thead), estrutura final das colunas:
```tsx
            <tr className="text-left text-[10px] uppercase text-muted-foreground">
              {canEdit && <th />}
              <th className="py-1">Alimento</th>
              <th className="py-1">Qtd</th>
              <th className="py-1">Gramas</th>
              {ITEM_MACROS.map((m) => (
                <th key={m.key} className="py-1">{m.label}</th>
              ))}
              {canEdit && <th />}
            </tr>
```
Linha de item (`<tr>`), início — os `register` mantêm o caminho inline completo com `as const` (padrão já usado e que compila neste componente); a coluna Gramas é controlada (`value` + `onGramsChange`) para recalcular:
```tsx
              <tr key={itemField.id}>
                {canEdit && (
                  <td className="py-1 pr-1 align-top">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      aria-label="Buscar alimento"
                      onClick={() => setPickerFor(itemIndex)}
                    >
                      🔍
                    </Button>
                  </td>
                )}
                <td className="py-1 pr-1 align-top"><Textarea rows={1} className={GROW_SM} aria-label="Alimento" {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.foodName`)} /></td>
                <td className="py-1 pr-1 align-top"><Textarea rows={1} className={`w-32 ${GROW_SM}`} aria-label="Quantidade" {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.quantity`)} /></td>
                <td className="py-1 pr-1 align-top">
                  <Input
                    className="h-7 w-16"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    aria-label="Gramas"
                    value={watchedItems?.[itemIndex]?.grams ?? ''}
                    onChange={(e) => onGramsChange(itemIndex, e.target.value)}
                  />
                </td>
                {ITEM_MACROS.map((m) => (
                  <td key={m.key} className="py-1 pr-1 align-top">
                    <Input className="h-7 w-16" type="number" inputMode="decimal" step="any" aria-label={m.label}
                      {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.${m.key}` as const)} />
                  </td>
                ))}
                {canEdit && (
                  <td className="py-1 align-top">
                    {/* ...os botões ↑ ↓ ✕ existentes (inalterados)... */}
                  </td>
                )}
              </tr>
```
Nota: a coluna Gramas usa `value` controlado + `onGramsChange` (para recalcular) em vez de `register`; o campo `grams` chega ao submit porque `onGramsChange` o grava via `setField` (`setValue`). Mantém `foodName` via `register` (editável). O `foodId` é escrito só via `setField` (não tem input visível).

Ao final do `OptionCard` (antes do `</div>` que fecha o card), montar o dialog do picker:
```tsx
      <FoodPickerDialog
        open={pickerFor !== null}
        onOpenChange={(o) => { if (!o) setPickerFor(null); }}
        onPick={(food) => { if (pickerFor !== null) onPickFood(pickerFor, food); setPickerFor(null); }}
      />
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @nutri-plus/web test -- meal-plan-editor`
Expected: PASS (incluindo o teste do picker+gramas).

- [ ] **Step 6: Verificação de todas as áreas + commit**

Run:
```
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```
Expected: shared-types build limpo; API verde + tsc 0; web verde + tsc 0; mobile tsc 0 (tipo aditivo não quebra os fixtures não-tipados).
```bash
git add apps/web/src/components/patients/food-picker-dialog.tsx apps/web/src/components/patients/meal-plan-editor.tsx apps/web/src/components/patients/meal-plan-editor.test.tsx
git commit -m "feat(web): food picker + grams auto-calc in meal editor

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

Manual (com a dev DB semeada do A1 + um paciente com uma Meta salva): abrir um plano → "Buscar alimento" num item → escolher um alimento → informar gramas → macros (incl. fibra/sódio) preenchem e recalculam ao mudar as gramas → editar um macro (override) funciona → "Usar Meta atual" preenche as metas → salvar → reabrir mostra os valores → exportar PDF mostra as colunas Fibra/Sódio. Um item de texto livre (sem alimento) continua salvando normalmente.

## Notas de comportamento (conhecidas/aceitas para o A2)

- **Recálculo ao mudar as gramas** só ocorre para alimentos escolhidos na sessão (cache em memória por `foodId`). Um item carregado de um plano existente (com `foodId` mas sem re-escolha) mantém os macros gravados; mudar as gramas atualiza o campo mas não recalcula sozinho (macros seguem editáveis; re-escolher o alimento recalcula). Não há `GET /foods/:id` no A1 para reidratar — evita endpoint novo/dep nova. Refinamento possível depois.
- Macros de itens com alimento são **editáveis** (override intencional). O server grava o que é enviado.
