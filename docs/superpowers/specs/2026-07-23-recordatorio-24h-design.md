# Recordatório Alimentar 24h (D2) — Design

**Date:** 2026-07-23
**Branch:** `feat/recordatorio-24h` (off main; F, B, A/TACO, C/LGPD, D1/anamnese todos mergeados)
**Status:** Approved design — ready for implementation plan

**Sub-projeto D2** (2ª parte de D). Um **recordatório alimentar de 24h**: o registro datado do que o paciente realmente comeu (refeições + alimentos + quantidades), montado pelo nutricionista no web, reaproveitando o catálogo TACO (`FoodSearch` + `macrosForPortion` do A) para macros automáticos e mostrando os totais do dia vs. a meta nutricional (NutritionTarget do B).

## Decisões (do brainstorming)

- **Nutricionista no web** monta o recordatório (como anamnese/planos); auto-registro do paciente (mobile) fica para depois.
- **Recordatório vs. meta:** os totais do dia registrado são somados e comparados com a **última `NutritionTarget`** do paciente (kcal/P/C/G); fibra/sódio aparecem como total informativo (sem meta).
- **Registro datado (histórico):** vários recordatórios ao longo do tempo, cada um de um dia — como as avaliações.
- **Estrutura mais enxuta que o plano — SEM opções/alternativas** (é um registro, não um plano). Editor **dedicado** (espelha o do plano, sem opções).

## Estado atual (o que reusar — não reinventar)

- **Forma do item (A2):** `MealItem` tem `foodId/grams/fiber/sodium` + fallback texto-livre (`foodName/quantity`) + macros; `macrosForPortion(food, grams)` (shared-types) calcula os macros no preview do editor; o servidor grava o que o editor envia (macros client-side).
- **Picker:** `FoodSearch`/`FoodPickerDialog` (`apps/web/src/components/foods/*`).
- **Editor de plano:** `meal-plan-editor.tsx` — árvore refeições→(opções)→itens com useFieldArray, picker + gramas, subtotais e a **barra total-vs-meta**; o recordatório espelha isso **sem** o nível de opções.
- **Meta:** `useNutritionTargets(patientId)` → a última `NutritionTarget` (`data?.[0]`), mapeando `targetCalories/proteinGrams/carbGrams/fatGrams`.
- **CRUD patient-scoped em árvore:** `meal-plans.service` (`createPlan`/`updatePlan` com delete+recreate da árvore numa transação; `assertFoodsExist` → 400; `@Roles(NUTRITIONIST)` + ownership → 404; `resolveScopeNutritionistId`).
- **Histórico datado:** `BodyAssessment` (dated) + a seção web (lista/gráficos) — padrão para a lista de recordatórios.
- **Abas do paciente:** `patient-detail.tsx` (Dados / Anamnese / Bioimpedância / Metas / Planos / Silhueta) — uma aba "Recordatório" encaixa.

## Modelo de dados (migração aditiva)

Espelha `MealPlan → Meal → MealItem` **menos o nível de opções**. Todas `onDelete: Cascade` (a exclusão de conta do C2 já cuida via cascade):
```prisma
model FoodRecall {
  id          String   @id @default(uuid())
  patientId   String
  patient     PatientProfile @relation(fields: [patientId], references: [id], onDelete: Cascade)
  recallDate  DateTime @default(now())   // o dia recordado (editável)
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
`PatientProfile += foodRecalls FoodRecall[]`; `Food += recallItems RecallItem[]` (back-relations virtuais).

shared-types (`v1/food-recall.ts`): `FoodRecall` (com `meals: RecallMeal[]` → `items: RecallItem[]`, datas ISO), `FoodRecallSummary` (`Omit<FoodRecall, 'meals'>`), `RecallMeal`/`RecallItem`, e os inputs aninhados `CreateFoodRecallRequest`/`UpdateFoodRecallRequest` (`recallDate?`, `notes?`, `meals?: RecallMealInput[]` com `items?: RecallItemInput[]` — os campos do item opcionais, como `MealItemInput`).

## API

Sub-recurso patient-scoped, espelhando `meal-plans` (`@Roles(UserRole.NUTRITIONIST)`, ownership do paciente → 404, `resolveScopeNutritionistId`). Módulo `food-recalls`:
- **`POST /v1/patients/:id/food-recalls`** (body `CreateFoodRecallRequest`) → cria a árvore (nested create; `order` atribuído pelo índice, como `mealsCreateInput`). Valida `foodId` inexistente → 400 (batch, como `assertFoodsExist`).
- **`GET /v1/patients/:id/food-recalls`** → resumos (`FoodRecallSummary[]`) por `recallDate` desc.
- **`GET /v1/patients/:id/food-recalls/:recallId`** → a árvore completa (refeições ordenadas → itens ordenados). 404 se não for do paciente possuído.
- **`PUT /v1/patients/:id/food-recalls/:recallId`** (body `UpdateFoodRecallRequest`) → **substitui a árvore** (delete das refeições → cascade nos itens → recria) numa transação, como `updatePlan`. Atualiza `recallDate`/`notes`. Valida `foodId` → 400.
- **`DELETE /v1/patients/:id/food-recalls/:recallId`** → apaga o recordatório (cascade nas refeições/itens).

O servidor grava os macros enviados pelo editor (client-side, como no A2 — o spread `...it` persiste `foodId/grams/fiber/sodium` + macros).

## Web

- `lib/api/food-recalls.ts` (`listFoodRecalls`/`getFoodRecall`/`createFoodRecall`/`updateFoodRecall`/`deleteFoodRecall` via `browserApiFetch`) + `lib/queries/food-recalls.ts` (`useFoodRecalls`/`useFoodRecall`/`useCreate…`/`useUpdate…`/`useDelete…`, key `['food-recalls', patientId]`) + `lib/validation/food-recall.ts` (zod da árvore, espelhando `lib/validation/meal-plan.ts`).
- `components/patients/recordatorio-section.tsx` (`{ patientId, canEdit }`): uma **lista** de recordatórios datados (data + totais) + entrada para o editor.
- `components/patients/food-recall-editor.tsx`: editor **dedicado** espelhando `meal-plan-editor.tsx` **sem opções** — campo de **data** (`recallDate`) + `notes`; refeições (nome/hora) com **itens** (picker `FoodPickerDialog` + coluna Gramas → macros auto via `macrosForPortion`, editáveis; fallback texto-livre; colunas kcal/P/C/G/fibra/sódio); subtotais por refeição; e a **barra total do dia** somando **todos os itens de todas as refeições** vs. a **última `NutritionTarget`** (via `useNutritionTargets`) — kcal/P/C/G com `/meta`, fibra/sódio total puro. `!canEdit` → form desabilitado, sem salvar.
- Nova aba **"Recordatório"** no `patient-detail.tsx` (após "Planos alimentares"), visível a todos; edição só com `canEdit`.

## Testes

- **API (jest):** cria um recordatório com árvore (refeições→itens, `order` por índice, `foodId/grams/macros` persistidos via `...it`); `PUT` substitui a árvore; `GET` lista por `recallDate` desc; `GET /:id` retorna a árvore; não-possuído → 404 (todos os verbos); `foodId` inexistente → 400. Mirar `meal-plans.service.spec.ts`.
- **Web (vitest):** o editor calcula os macros ao escolher alimento + gramas; a barra de totais soma **todos** os itens vs. a última Meta (mockar `useNutritionTargets`); "Salvar" chama create/update; item de texto-livre funciona; `!canEdit` desabilita; a lista datada renderiza; a aba "Recordatório" aparece no detalhe.
- **shared-types:** `build` limpo. Mobile inalterado (tsc só se ripple — não esperado).

## Restrições

- Migração **aditiva** (3 tabelas + back-relations; todas `onDelete: Cascade`). shared-types reconstruído. **Sem novas dependências**. pt-BR.
- **Nutricionista-only (web)**; paciente/mobile inalterado. `@Roles(NUTRITIONIST)` + ownership → 404, `resolveScopeNutritionistId`.
- **Sem opções/alternativas** (diferente do plano). Editor **dedicado** (não sobrecarregar o editor de plano). Servidor grava o que o editor envia (macros client-side, como A2).
- Reusar padrões: item/food-ref do A2, `FoodSearch`/`FoodPickerDialog`, `macrosForPortion`, CRUD-em-árvore do `meal-plans`, histórico datado das avaliações, react-hook-form + zod, abas/seções do detalhe.
- Combinar estilos de aspas (api aspas simples; web por arquivo). Testes API JEST / web vitest. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** push/PR sem pedir. Branch `feat/recordatorio-24h`. Verificar por área: shared-types build; API test+tsc; web test+tsc.

## Mapa de arquivos

- `apps/api/prisma/schema.prisma` (+ `FoodRecall`/`RecallMeal`/`RecallItem` + back-relations) + migração
- `packages/shared-types/src/v1/food-recall.ts` (novo) + `v1/index.ts`
- `apps/api/src/food-recalls/**` (module + controller `patients/:id/food-recalls` + service + DTOs + specs)
- `apps/web/src/lib/api/food-recalls.ts` + `lib/queries/food-recalls.ts` + `lib/validation/food-recall.ts` + `components/patients/{recordatorio-section,food-recall-editor}.tsx` (+ tests) + `patient-detail.tsx` (aba)
