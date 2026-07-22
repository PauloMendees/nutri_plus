# IA Ancorada no TACO + Consolidação do Cálculo — Design (A3)

**Date:** 2026-07-18
**Branch:** `feat/taco-food-database` (mesma branch do A1/A2 — todo o TACO no PR #46)
**Status:** Approved design — ready for implementation plan

**Sub-projeto A3 (final)** da feature "A" (TACO). O A1 entregou o catálogo `Food` + busca; o A2, itens de refeição baseados em alimentos (`foodId/grams/fiber/sodium` + `macrosForPortion` + plano vs. meta). O A3 fecha a feature com dois trabalhos independentes: **(1)** ancorar a **geração por IA** no catálogo TACO (itens gerados passam a referenciar alimentos reais com macros recalculados no servidor) e **(2)** consolidar o calculador de metas duplicado (`meal-generation/nutrition.ts` ↔ `shared-types/energy.ts`), um follow-up registrado do sub-projeto B.

## Decisões (do brainstorming)

- **Ancoragem por casamento de nome + fallback:** a IA nomeia o alimento e informa gramas; o servidor casa `foodName → Food` (alta confiança) e, quando casa, grava `foodId` + **recalcula** os macros (`macrosForPortion`, autoritativo — a peça que o A2 adiou). Sem casar → item de texto livre com a estimativa da IA (como hoje).
- **Fallback = texto livre:** item não casado nunca falha a geração; retrocompatível.
- **Consolidação preservando comportamento:** move a lógica do calculador da IA para o shared-types, **mantendo os números exatos** (presets por objetivo, `measuredBmr`, tratamento de OTHER). Deleta a duplicata na API. Zero mudança na saída da IA.
- **Só a geração é ancorada** (não o `adjust`). No match, o `foodName` gravado é o **nome canônico do TACO**.

## Estado atual (o que já existe)

- **Geração IA** (`meal-generation.service.ts` → `generate`): calcula `targets` via `computeTargets` (de `nutrition.ts`), chama a OpenAI com `mealPlanResponseSchema`, e persiste via `mealPlans.createGeneratedPlan`. Os itens da IA são **texto livre**: `{ foodName, quantity, calories, protein, carbs, fats }` (macros são **estimativas** da IA), sem `foodId`.
- **`nutrition.ts`** (o calculador da IA) diverge do `energy.ts` (o calculador das Metas/B): compartilham primitivos (fatores de atividade, forma do Mifflin) mas o da IA é **preset por objetivo** — `OBJECTIVE_FACTOR` (WEIGHT_LOSS 0.8, MAINTENANCE 1.0, RECOMPOSITION 0.95, MUSCLE_GAIN 1.1), `PROTEIN_PER_KG` (2.0 exceto MAINTENANCE 1.6), `FAT_PCT` 0.25, `SEX_CONSTANT` com OTHER/PREFER = −78, e um atalho `measuredBmr` (usa o BMR de bioimpedância quando presente). O `energy.ts` é parametrizado (o nutri escolhe fórmula/proteína/gordura), exige MALE/FEMALE, e não tem `measuredBmr`.
- **`adjust`** (revisão por IA): retorna um `MealPlanDraft` não-persistido; usa o mesmo `mealPlanResponseSchema`. **Fora de escopo** para ancoragem.

## Parte 1 — Consolidação do calculador (preservando comportamento)

- Novo módulo `packages/shared-types/src/v1/meal-targets.ts` com a lógica de `nutrition.ts` **verbatim em valores**: `computeAge`, `computeBmr`, `computeTargets`, `NutritionInputs`, `NutritionTargets`, e as constantes `OBJECTIVE_FACTOR`, `PROTEIN_PER_KG`, `FAT_PCT`, `SEX_CONSTANT`. Usa os enums do shared-types (`Gender`, `ActivityLevel`, `PatientObjective` de `./patient`). Reusa `activityFactor` do `energy.ts` no passo TDEE (mesmos valores — dedup real do único primitivo idêntico). Exporta de `v1/index.ts`.
- **Deleta** `apps/api/src/meal-generation/nutrition.ts`. `meal-generation.service.ts` importa `computeAge, computeTargets, NutritionInputs` de `@nutri-plus/shared-types`. Os campos do patient são enums Prisma (value-identical) → cast no boundary (padrão do B).
- Move `apps/api/src/meal-generation/nutrition.spec.ts` para testar a versão do shared-types (via jest da API, como `energy.spec.ts`), com os **mesmos valores esperados**. Behavior-preserving: mesmos números de target.
- **Nota:** `energy.ts` (usado pelas Metas/B) fica **inalterado**. Os dois calculadores co-existem no shared-types (fonte única de toda a matemática nutricional); não force­mos os dois a compartilhar o Mifflin, pois o tratamento de sexo diverge de propósito (energy.ts: FEMALE/OTHER = −161; IA: OTHER = −78) e unificar mudaria a saída.

## Parte 2 — Ancoragem da geração (casar por nome + fallback)

- **Schema** (`meal-plan-response.schema.ts`): adiciona `grams: z.number()` a cada item. Mantém `foodName/quantity/calories/protein/carbs/fats` (estimativas — usadas no fallback).
- **Prompt** (`ai/prompts/meal-plan.prompt.ts`): instrui a IA a preferir alimentos comuns/brasileiros e informar `grams` por item (porção em gramas). Não injeta o catálogo (não é RAG).
- **Matcher** (novo, `apps/api/src/meal-generation/food-matcher.ts`): função pura `matchFood(foodName, foods): Food | null`. Normaliza (`normalizeSearch`) e tokeniza o `foodName`; casa quando **todas** as palavras de conteúdo da IA estão contidas nos tokens do `searchName` de um `Food`; escolhe o candidato mais específico (menos tokens extras). Alta confiança: exige ≥ 2 palavras de conteúdo casadas, **ou** um nome de 1 palavra idêntico — para não casar por uma única palavra comum. Sem candidato → `null`. Testada.
- **Fluxo** (`meal-generation.service.generate`): após a resposta da IA, carrega os `Food` uma vez (`findMany`, catálogo pequeno) e, para cada item, aplica `matchFood`. No match → item `{ foodName: food.name (canônico), foodId: food.id, grams, ...macrosForPortion(food, grams) }` (macros reais, incl. fibra/sódio; a estimativa da IA é descartada). Sem match → item de texto livre `{ foodName, quantity, calories, protein, carbs, fats }` (como hoje, sem `foodId`).
- **Persistência:** estende `GeneratedMealInput` (item) com os campos opcionais `foodId?, grams?, fiber?, sodium?`. `mealPlans.createGeneratedPlan` já passa os itens ao `mealsCreateInput`, que faz o spread `...it` — os campos novos persistem (colunas criadas no A2). O `quantity` do item ancorado pode ficar vazio (a porção é a gramagem) ou repetir a gramagem como texto; para simplicidade, ancorado usa `quantity` = `` (vazio) e `grams` numérico.

## Fora de escopo / retrocompat

- **`adjust`** não é ancorado. O schema ganha `grams` (compartilhado), então o rascunho do `adjust` passa a carregar `grams` (o editor A2 mostra), mas **sem** match/`foodId` — segue texto livre com macros da IA. `adjust` continua carregando targets/objetivo do plano existente, sem recalcular.
- Item sem match = comportamento de hoje. Planos existentes e a geração atual seguem válidos. Nenhuma migração.
- **Web/mobile inalterados:** o editor (A2) já renderiza `foodId/grams/fibra/sódio`; um plano gerado e ancorado vem com esses campos preenchidos. O PDF (A2) já mostra fibra/sódio. (A limitação de recálculo-por-sessão do A2 aplica-se: reabrir um plano ancorado e mudar gramas não recalcula sozinho — os macros ficam editáveis.)

## Testes

- **shared-types/API (jest):** `meal-targets` — os mesmos casos conhecidos do `nutrition.spec.ts` atual (mesmos valores de `computeTargets`/`computeBmr`/`computeAge`), provando behavior-preserving. shared-types `build` limpo.
- **API (jest):** `food-matcher` — match exato, match por subconjunto de tokens (ex.: "arroz integral cozido" → "Arroz, integral, cozido"), escolha do mais específico, sem match, e a guarda de ≥2 palavras (não casar "frango" sozinho num nome qualquer). `meal-generation.service` — item casado grava `foodId` + macros de `macrosForPortion` (não a estimativa da IA); item não casado cai pra texto livre; os `targets` consolidados são idênticos aos de hoje; mocka o provider da OpenAI + `prisma.food.findMany`.
- **Sem testes novos de web/mobile** (nenhuma mudança de código lá); rodar `tsc` das duas áreas por causa do ripple do shared-type (aditivo).

## Restrições

- **Sem migração** (colunas do A2). shared-types reconstruído. **Sem novas dependências.** pt-BR.
- Consolidação **behavior-preserving**: mesmos números de target; `energy.ts` inalterado; `nutrition.ts` deletado; a única fonte da matemática passa a ser o shared-types.
- Ancoragem só na geração; fallback texto livre; `foodName` canônico do TACO no match; macros recalculados no servidor por `macrosForPortion` (autoridade server-side, a peça adiada do A2).
- Combinar estilos de aspas por arquivo (api aspas simples). Testes API+mobile JEST / web vitest.
- Trailer de commit `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** dar push/PR sem pedir (a branch já tem o PR #46; push atualiza o #46 quando você pedir). Ficar em `feat/taco-food-database`.
- Verificar por área: shared-types build; API test+tsc; web tsc; mobile tsc.

## Mapa de arquivos

- `packages/shared-types/src/v1/meal-targets.ts` (novo — lógica movida de nutrition.ts) + `v1/index.ts` (export)
- `apps/api/src/meal-generation/nutrition.ts` (**deletado**) + `nutrition.spec.ts` (movido/reapontado para `@nutri-plus/shared-types`)
- `apps/api/src/meal-generation/food-matcher.ts` (novo) + `food-matcher.spec.ts` (novo)
- `apps/api/src/meal-generation/schema/meal-plan-response.schema.ts` (+ `grams`) + spec
- `apps/api/src/ai/prompts/meal-plan.prompt.ts` (instrução de gramas + alimentos comuns)
- `apps/api/src/meal-generation/meal-generation.service.ts` (import do shared-types; matching + macros no fluxo generate) + `meal-generation.service.spec.ts`
- `apps/api/src/meal-plans/meal-plans.service.ts` (`GeneratedMealInput` item += `foodId?/grams?/fiber?/sodium?`; o spread já persiste)
