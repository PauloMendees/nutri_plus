# Itens de Refeição baseados em Alimentos + Plano vs. Meta — Design (A2)

**Date:** 2026-07-18
**Branch:** `feat/taco-food-database` (mesma branch do A1 — todo o TACO num só PR: #46)
**Status:** Approved design — ready for implementation plan

**Sub-projeto A2** da feature "A" (TACO) decomposta em A1/A2/A3. O A1 entregou o catálogo `Food` + busca + `FoodSearch`. O A2 deixa o nutricionista montar itens do plano a partir de **alimentos reais** (com gramas → macros calculados) e conecta as metas do plano à **Meta nutricional** (`NutritionTarget`) do paciente (sub-projeto B). O A3 depois ancora a geração por IA no TACO e consolida o calculador duplicado.

## Decisões (do brainstorming)

- **Aditivo/retrocompatível:** o item ganha referência **opcional** a `Food` + gramas → macros calculados; itens de texto livre (e os gerados por IA) seguem funcionando. Nada de switch destrutivo, nada de migração de dados existentes.
- **Puxar da última Meta:** as metas do plano (`targetCalories/Protein/Carbs/Fats`, que hoje são digitadas à mão) podem ser pré-preenchidas a partir da última `NutritionTarget` do paciente, editáveis. A barra total/meta que já existe passa a refletir a Meta real do B.
- **Incluir fibra + sódio:** o item e os totais do plano passam a considerar fibra e sódio (além de kcal/P/C/G), no **editor web** e no **PDF**. Não há meta para fibra/sódio (o `NutritionTarget` só tem kcal/P/C/G) — aparecem como informativo.
- **Mobile:** o item do app permanece **só kcal por item** (densidade — escolha de produto atual). O shared-type `MealItem` ganha os campos novos de forma aditiva (`tsc` limpo). Fibra/sódio ficam totalmente expostos no editor web + PDF.

## Estado atual (o que já existe — não refazer)

`MealPlan → Meal → MealOption → MealItem`. Opções são alternativas intercambiáveis; o **total do dia conta só a 1ª opção** de cada refeição. O editor (`meal-plan-editor.tsx`) já tem: subtotais por opção, total do dia, card *Metas (por dia)* com `targetCalories/Protein/Carbs/Fats` digitados à mão, e uma **barra total/meta**. PDF (`meal-plan-doc.ts`) e app mobile (`meal-plan-view.tsx`) renderizam os itens. Hoje o `MealItem` é `foodName` (texto livre) + `quantity` (texto livre) + `calories/protein/carbs/fats` (manuais). **Nenhum vínculo com o catálogo `Food`, nenhum cálculo automático.**

## Modelo de dados (migração aditiva)

`MealItem` ganha:
```prisma
model MealItem {
  // ...campos existentes (foodName, quantity, calories, protein, carbs, fats, order)...
  foodId  String?
  food    Food?   @relation(fields: [foodId], references: [id], onDelete: SetNull)
  grams   Float?          // porção em gramas quando referencia um Food
  fiber   Float?          // por porção (calculado ou manual)
  sodium  Float?          // por porção (calculado ou manual)
}
```
`Food` ganha a back-relation virtual `mealItems MealItem[]` (sem coluna). Nenhum campo existente é alterado. `onDelete: SetNull` — o catálogo é global e não é apagado, mas se um `Food` sumir o item mantém seu snapshot de macros.

shared-types (`packages/shared-types/src/v1/meal-plan.ts`):
- `MealItem +=` `foodId: string | null`, `grams: number | null`, `fiber: number | null`, `sodium: number | null`.
- `MealItemInput +=` `foodId?: string`, `grams?: number`, `fiber?: number`, `sodium?: number`.

## Cálculo (função pura no shared-types)

`packages/shared-types/src/v1/food-portion.ts`:
```ts
export interface PortionMacros {
  calories: number; protein: number; carbs: number; fats: number; fiber: number; sodium: number;
}
export function macrosForPortion(
  food: Pick<Food, 'energyKcal' | 'protein' | 'carbohydrate' | 'lipid' | 'fiber' | 'sodium'>,
  grams: number,
): PortionMacros;
```
Cada valor = `round((nutrientePor100g ?? 0) × grams / 100)`. Mapeamento `energyKcal→calories, protein→protein, carbohydrate→carbs, lipid→fats, fiber→fiber, sodium→sodium`. Arredonda para inteiro (casa com o visual atual do plano). Nutriente `null` no catálogo → `0` na porção. Exportada de `v1/index.ts`. Fonte única usada no preview do editor web (e disponível para o A3 ancorar a IA server-side depois).

## Comportamento do item (editor)

Ao escolher um alimento no `FoodSearch` + informar gramas, o editor **calcula e preenche** os campos de macro do item (`calories/protein/carbs/fats/fiber/sodium`) via `macrosForPortion`. Os campos permanecem **editáveis** — o nutri pode sobrescrever (arredondar, ajustar preparo). `foodName` é auto-preenchido com o nome do alimento (editável). O item guarda `foodId` + `grams` para proveniência e recálculo ao mudar as gramas. Um item **sem** `foodId` continua sendo texto livre com macros manuais (comportamento de hoje, e o que a IA gera).

**Persistência:** o server armazena o que o editor envia (arquitetura atual — o nutri é confiável; todos os totais já são calculados no cliente e os números gravados verbatim). O A3 é quem trará cálculo server-side autoritativo para a geração por IA. Para o A2, o cálculo vive no shared-types e é chamado no preview web.

## API

- `MealItemDto` (`apps/api/src/meal-plans/dto/meal-item.dto.ts`) `+=` `foodId?` (`@IsUUID`, opcional), `grams?` (`@IsNumber @Min(0)`), `fiber?` (`@IsNumber @Min(0)`), `sodium?` (`@IsNumber @Min(0)`).
- `meal-plans.service` (create + update): persiste `foodId/grams/fiber/sodium` ao (re)montar os itens. Valida que qualquer `foodId` informado existe em `Food` (checagem em lote) → `400` amigável se algum não existir (evita ref pendente e erro 500 de FK).
- Sem endpoint novo. A leitura do plano (`findMany` com itens) já traz as colunas novas.

## Plano vs. Meta ("Usar Meta atual")

Botão **"Usar Meta atual"** no card *Metas (por dia)* do editor: busca a **última** `NutritionTarget` do paciente e preenche os campos de meta do plano — mapeamento `targetCalories←targetCalories, targetProtein←proteinGrams, targetCarbs←carbGrams, targetFats←fatGrams`. Reusa o endpoint de listagem do B (`GET /v1/patients/:id/nutrition-targets`, ordenado por `targetDate desc` — o primeiro é o mais recente). Desabilitado (com dica) quando não há Meta. Campos permanecem editáveis; a barra total/meta existente passa a comparar com a Meta real.

## Web (editor)

- `MealItemInput`/form: cada item ganha um **picker `FoodSearch` compacto + campo gramas**. Ao selecionar alimento e informar gramas → macros preenchidos (editáveis) via `macrosForPortion`. A tabela do item já tem `overflow-x-auto`.
- Duas colunas novas no item: **Fibra, Sódio** — no cabeçalho da tabela, subtotal por opção e total do dia. Sem meta na barra total/meta para elas (informativo).
- Botão **"Usar Meta atual"** (acima).
- `lib/queries` para a última Meta do paciente (reusa/estende a query de nutrition-targets do B).

## PDF (`apps/api/src/meal-plans/pdf/meal-plan-doc.ts`)

`PdfMealItem +=` `fiber`, `sodium`. A tabela de item de cada opção ganha colunas **Fibra** e **Sódio** (cabeçalho + linhas + linha de subtotal). Larguras `auto` acomodam (6 → 8 colunas). As metas do topo seguem só com os 4 macros.

## Mobile

O shared-type `MealItem` ganha `foodId/grams/fiber/sodium` (aditivo → `tsc` limpo). O `meal-plan-view.tsx` **não muda**: o item segue mostrando só kcal (densidade), e o cabeçalho do plano segue mostrando as metas kcal/P/C/G. Nenhuma fixture nova esperada (verificar via `tsc`).

## Testes

- **shared-types:** `macrosForPortion` — valores conhecidos (ex.: arroz integral 150 g), nutriente `null` → `0`, arredondamento. `build` limpo.
- **API (jest):** meal-plans create/update persiste `foodId/grams/fiber/sodium`; `MealItemDto` valida (`foodId` uuid, macros ≥ 0); `foodId` inexistente → `400`; PDF (`meal-plan-doc`) inclui colunas/subtotal de fibra e sódio.
- **Web (vitest):** escolher alimento + gramas calcula os macros nos campos (e são editáveis/sobrescrevíveis); colunas e totais de fibra/sódio; "Usar Meta atual" preenche as metas a partir da última `NutritionTarget`; item de texto livre (sem `foodId`) segue funcionando.
- **Mobile (jest):** `tsc` limpo após a mudança de shared-type; testes do viewer seguem passando.

## Restrições

- Migração **aditiva** na dev DB compartilhada (`prisma migrate dev`; `prisma generate` se preciso). shared-types reconstruído. **Sem novas dependências.** pt-BR.
- Cálculo puro no shared-types (única fonte usada pelo preview web; disponível ao A3). Reaproveita `FoodSearch`/`Food` do A1 e o padrão de função-pura do B (`energy.ts`).
- Compatibilidade retroativa: itens sem `foodId` = texto livre com macros manuais (hoje). Nada de switch destrutivo.
- Combinar estilos de aspas por arquivo (api aspas simples; web por arquivo). Testes API+mobile JEST / web vitest.
- Trailer de commit `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** dar push/PR (a branch já tem o PR #46; commits ficam locais até você pedir). Ficar em `feat/taco-food-database`.
- Verificar por área (shared-types build; API test+tsc; web test+tsc; mobile tsc por causa do ripple no shared-type).

## Mapa de arquivos

- `apps/api/prisma/schema.prisma` (`MealItem +=` `foodId/grams/fiber/sodium` + relação; `Food +=` back-relation) + migração
- `packages/shared-types/src/v1/meal-plan.ts` (`MealItem`/`MealItemInput`) + `v1/food-portion.ts` (novo, cálculo puro) + `v1/index.ts`
- `apps/api/src/meal-plans/dto/meal-item.dto.ts` (+4 campos) + `meal-plans.service.ts` (persistir + validar `foodId`) + specs
- `apps/api/src/meal-plans/pdf/meal-plan-doc.ts` (colunas fibra/sódio) + spec
- `apps/web/src/lib/validation/meal-plan.ts` (schema dos campos novos) + `components/patients/meal-plan-editor.tsx` (picker + gramas + colunas fibra/sódio + "Usar Meta atual") + `lib/queries` (última Meta) + testes
- Mobile: nenhuma mudança de código além do shared-type aditivo (verificar `tsc`)
