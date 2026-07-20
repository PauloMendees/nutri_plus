# IA Ancorada no TACO + Consolidação do Cálculo (A3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ancorar a geração por IA no catálogo TACO (itens gerados referenciam alimentos reais com macros recalculados no servidor, com fallback texto-livre) e consolidar o calculador de metas duplicado (`meal-generation/nutrition.ts` → `shared-types`) preservando os números.

**Architecture:** Dois trabalhos independentes, aditivos, sem migração (o A2 já criou as colunas). (1) Move a matemática do calculador da IA para `shared-types/meal-targets.ts` (enums do shared-types, reusa `activityFactor` do `energy.ts`), deleta o `nutrition.ts` da API — mesmos números. (2) Um matcher puro casa o `foodName` da IA a um `Food` (subconjunto de tokens, alta confiança); no match o servidor grava `foodId` + nome canônico + macros de `macrosForPortion` e descarta a estimativa da IA; sem match, item de texto livre como hoje.

**Tech Stack:** NestJS + Prisma 7 + OpenAI (structured output); `@nutri-plus/shared-types` (tsc build, sem runner). Testes API JEST / web vitest.

## Global Constraints

- **Sem migração** (colunas criadas no A2). shared-types reconstruído. **Sem novas dependências.** pt-BR.
- Consolidação **behavior-preserving**: mesmos números de target; `energy.ts` **inalterado**; `nutrition.ts` **deletado**; a fonte única da matemática passa a ser o shared-types; o spec movido mantém os **mesmos valores esperados**.
- Ancoragem: casar por nome (subconjunto de tokens, alta confiança — **≥ 2 palavras de conteúdo, ou nome de 1 palavra exato**) + fallback texto-livre (a geração **nunca falha**). No match: grava `foodId` + `Food.name` canônico + macros de `macrosForPortion(food, grams)` (autoridade server-side — a peça adiada do A2), **descarta** a estimativa da IA. Sem match: item de texto-livre de hoje.
- Só a **geração** é ancorada (não o `adjust`). O schema ganha `grams` (compartilhado) — o rascunho do `adjust` carrega `grams` mas segue texto-livre.
- Boundary de enum: enums do shared-types no cálculo; **cast** dos campos enum do patient (Prisma) no call site da API (padrão do B).
- **Web/mobile: sem mudança de código** (editor/PDF do A2 já renderizam `foodId/grams/fiber/sodium`); rodar `tsc` de web+mobile pelo ripple do shared-type.
- Combinar estilos de aspas (api aspas simples). Testes API JEST / web vitest. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Não** dar push/PR (a branch já tem o PR #46; commits locais). Branch `feat/taco-food-database`.
- Verificar por área: shared-types build; API test+tsc; web tsc; mobile tsc.

---

### Task 1: Consolidar o calculador em `shared-types/meal-targets.ts` (preservando comportamento)

**Files:**
- Create: `packages/shared-types/src/v1/meal-targets.ts`
- Modify: `packages/shared-types/src/v1/index.ts`
- Delete: `apps/api/src/meal-generation/nutrition.ts`
- Modify: `apps/api/src/meal-generation/meal-generation.service.ts` (imports + cast no `requireInputs`)
- Move/Rewrite test: delete `apps/api/src/meal-generation/nutrition.spec.ts`, create `apps/api/src/meal-generation/meal-targets.spec.ts`

**Interfaces:**
- Consumes: `activityFactor` (de `./energy`), `Gender`/`ActivityLevel`/`PatientObjective` (de `./patient`).
- Produces: `computeAge(birthDate, now)`, `computeBmr(i)`, `computeTargets(i: NutritionInputs): NutritionTargets`, tipos `NutritionInputs`/`NutritionTargets` — importáveis de `@nutri-plus/shared-types`.

- [ ] **Step 1: Criar `meal-targets.ts`** (lógica movida verbatim-em-valores; enums do shared-types; reusa `activityFactor`)

```ts
import { ActivityLevel, Gender, PatientObjective } from './patient';
import { activityFactor } from './energy';

// Ajuste calórico aplicado ao TDEE por objetivo.
export const OBJECTIVE_FACTOR: Record<PatientObjective, number> = {
  WEIGHT_LOSS: 0.8,
  MAINTENANCE: 1.0,
  RECOMPOSITION: 0.95,
  MUSCLE_GAIN: 1.1,
};

// Proteína (g/kg) por objetivo.
export const PROTEIN_PER_KG: Record<PatientObjective, number> = {
  WEIGHT_LOSS: 2.0,
  MUSCLE_GAIN: 2.0,
  RECOMPOSITION: 2.0,
  MAINTENANCE: 1.6,
};

// Fração das calorias vinda de gordura.
export const FAT_PCT = 0.25;

// Constante de sexo do Mifflin-St Jeor. OTHER / PREFER_NOT_TO_SAY usam a média das
// constantes masculina (+5) e feminina (-161): -78.
const SEX_CONSTANT: Record<Gender, number> = {
  MALE: 5,
  FEMALE: -161,
  OTHER: -78,
  PREFER_NOT_TO_SAY: -78,
};

export interface NutritionInputs {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  objective: PatientObjective;
  activityLevel: ActivityLevel;
  measuredBmr?: number | null;
}

export interface NutritionTargets {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

// Anos inteiros entre birthDate e now (UTC-estável).
export function computeAge(birthDate: Date, now: Date): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age;
}

// BMR de bioimpedância quando presente e positivo; senão Mifflin-St Jeor.
export function computeBmr(i: {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  measuredBmr?: number | null;
}): number {
  if (i.measuredBmr != null && i.measuredBmr > 0) {
    return i.measuredBmr;
  }
  return 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age + SEX_CONSTANT[i.gender];
}

export function computeTargets(i: NutritionInputs): NutritionTargets {
  const bmr = computeBmr(i);
  const tdee = bmr * activityFactor(i.activityLevel);
  const calories = Math.round(tdee * OBJECTIVE_FACTOR[i.objective]);
  const protein = Math.round(PROTEIN_PER_KG[i.objective] * i.weightKg);
  const fats = Math.round((calories * FAT_PCT) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fats * 9) / 4));
  return { calories, protein, carbs, fats };
}
```

- [ ] **Step 2: Exportar** — em `packages/shared-types/src/v1/index.ts`, adicionar após `export * from './food-portion';`:
```ts
export * from './meal-targets';
```

- [ ] **Step 3: Build do shared-types**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: sem erros.

- [ ] **Step 4: Mover o teste** — deletar `apps/api/src/meal-generation/nutrition.spec.ts` e criar `apps/api/src/meal-generation/meal-targets.spec.ts` (importa do pacote; usa MEMBROS de enum; MESMOS valores esperados):

```ts
import {
  computeAge,
  computeBmr,
  computeTargets,
  Gender,
  PatientObjective,
  ActivityLevel,
} from '@nutri-plus/shared-types';

describe('computeAge', () => {
  it('returns whole years when the birthday has passed this year', () => {
    expect(computeAge(new Date('1990-06-10'), new Date('2026-06-17'))).toBe(36);
  });
  it('subtracts a year when the birthday has not been reached yet', () => {
    expect(computeAge(new Date('1990-06-20'), new Date('2026-06-17'))).toBe(35);
  });
  it('is timezone-stable at a UTC year boundary', () => {
    expect(computeAge(new Date('2000-01-01T00:00:00Z'), new Date('2024-01-01T00:00:00Z'))).toBe(24);
  });
});

describe('computeBmr', () => {
  it('uses Mifflin-St Jeor with +5 for MALE', () => {
    expect(computeBmr({ weightKg: 80, heightCm: 180, age: 30, gender: Gender.MALE })).toBe(1780);
  });
  it('uses -161 for FEMALE', () => {
    expect(computeBmr({ weightKg: 60, heightCm: 165, age: 40, gender: Gender.FEMALE })).toBeCloseTo(1270.25, 2);
  });
  it('uses -78 for OTHER', () => {
    expect(computeBmr({ weightKg: 70, heightCm: 170, age: 25, gender: Gender.OTHER })).toBeCloseTo(1559.5, 2);
  });
  it('uses -78 for PREFER_NOT_TO_SAY (same as OTHER)', () => {
    expect(computeBmr({ weightKg: 70, heightCm: 170, age: 25, gender: Gender.PREFER_NOT_TO_SAY })).toBeCloseTo(1559.5, 2);
  });
  it('prefers a measured BMR over the formula', () => {
    expect(computeBmr({ weightKg: 80, heightCm: 180, age: 30, gender: Gender.MALE, measuredBmr: 1500 })).toBe(1500);
  });
  it('falls back to the formula when measuredBmr is null or 0', () => {
    expect(computeBmr({ weightKg: 80, heightCm: 180, age: 30, gender: Gender.MALE, measuredBmr: null })).toBe(1780);
    expect(computeBmr({ weightKg: 80, heightCm: 180, age: 30, gender: Gender.MALE, measuredBmr: 0 })).toBe(1780);
  });
});

describe('computeTargets', () => {
  it('computes calories and macros for a MALE weight-loss case (formula BMR)', () => {
    const t = computeTargets({
      weightKg: 80, heightCm: 180, age: 30,
      gender: Gender.MALE, objective: PatientObjective.WEIGHT_LOSS, activityLevel: ActivityLevel.MODERATE,
      measuredBmr: null,
    });
    expect(t.calories).toBe(2207);
    expect(t.protein).toBe(160);
    expect(t.fats).toBe(61);
    expect(t.carbs).toBe(255);
  });
  it('uses the maintenance protein factor (1.6 g/kg) and a measured BMR', () => {
    const t = computeTargets({
      weightKg: 70, heightCm: 175, age: 35,
      gender: Gender.MALE, objective: PatientObjective.MAINTENANCE, activityLevel: ActivityLevel.SEDENTARY,
      measuredBmr: 1500,
    });
    expect(t.calories).toBe(1800);
    expect(t.protein).toBe(112);
    expect(t.fats).toBe(50);
    expect(t.carbs).toBe(226);
  });
  it('floors carbs at 0 when protein+fat exceed the calorie budget', () => {
    const t = computeTargets({
      weightKg: 100, heightCm: 170, age: 30,
      gender: Gender.MALE, objective: PatientObjective.WEIGHT_LOSS, activityLevel: ActivityLevel.SEDENTARY,
      measuredBmr: 500,
    });
    expect(t.carbs).toBe(0);
  });
});
```

- [ ] **Step 5: Deletar `nutrition.ts` e reapontar o service**

Deletar `apps/api/src/meal-generation/nutrition.ts`.

Em `apps/api/src/meal-generation/meal-generation.service.ts`:
- Trocar `import { computeAge, computeTargets, NutritionInputs } from './nutrition';` por:
```ts
import {
  computeAge,
  computeTargets,
  NutritionInputs,
  Gender,
  PatientObjective,
  ActivityLevel,
} from '@nutri-plus/shared-types';
```
- No `requireInputs`, afrouxar os campos enum do parâmetro para `string | null` e **cast** no retorno (os valores são idênticos ao runtime — boundary do B). Substituir a assinatura + o `return`:
```ts
  private requireInputs(patient: {
    height: number | null;
    birthDate: Date | null;
    gender: string | null;
    objective: string | null;
    activityLevel: string | null;
    assessments: { weight: number | null; basalMetabolicRate: number | null }[];
  }): NutritionInputs {
    const latest = patient.assessments[0];
    const missing: string[] = [];
    if (latest?.weight == null) missing.push('weight (latest assessment)');
    if (patient.height == null) missing.push('height');
    if (patient.birthDate == null) missing.push('birthDate');
    if (patient.gender == null) missing.push('gender');
    if (patient.objective == null) missing.push('objective');
    if (patient.activityLevel == null) missing.push('activityLevel');
    if (missing.length > 0) {
      throw new UnprocessableEntityException(
        `Cannot generate a plan: missing ${missing.join(', ')}`,
      );
    }

    return {
      weightKg: latest!.weight!,
      heightCm: patient.height!,
      age: computeAge(patient.birthDate!, new Date()),
      gender: patient.gender! as Gender,
      objective: patient.objective! as PatientObjective,
      activityLevel: patient.activityLevel! as ActivityLevel,
      measuredBmr: latest!.basalMetabolicRate,
    };
  }
```

- [ ] **Step 6: Rodar os testes + tsc**

Run: `pnpm --filter @nutri-plus/api test -- meal-targets meal-generation`
Expected: `meal-targets` PASS com os mesmos valores; `meal-generation.service` segue passando.
Run: `pnpm --filter @nutri-plus/api exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types/src/v1/meal-targets.ts packages/shared-types/src/v1/index.ts apps/api/src/meal-generation/meal-generation.service.ts apps/api/src/meal-generation/meal-targets.spec.ts
git add -u apps/api/src/meal-generation/nutrition.ts apps/api/src/meal-generation/nutrition.spec.ts
git commit -m "refactor: consolidate meal-generation calc into shared-types (behavior-preserving)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Matcher de alimentos (`food-matcher.ts`)

**Files:**
- Create: `apps/api/src/meal-generation/food-matcher.ts`
- Test: `apps/api/src/meal-generation/food-matcher.spec.ts`

**Interfaces:**
- Consumes: `normalizeSearch` (de `../foods/normalize`).
- Produces: `matchFood<T extends { name: string; searchName: string }>(foodName: string, foods: T[]): T | null`.

- [ ] **Step 1: Teste que falha** — `apps/api/src/meal-generation/food-matcher.spec.ts`:

```ts
import { matchFood } from './food-matcher';

const f = (name: string) => ({ id: name, name, searchName: name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() });

describe('matchFood', () => {
  it('casa por subconjunto de tokens (ignora acentos, vírgulas e ordem)', () => {
    const foods = [f('Arroz, integral, cozido'), f('Feijão, preto, cozido')];
    expect(matchFood('Arroz integral cozido', foods)?.name).toBe('Arroz, integral, cozido');
  });

  it('escolhe o candidato mais específico (menos tokens extras)', () => {
    const foods = [f('Arroz, integral, cozido, com feijão'), f('Arroz, integral, cozido')];
    expect(matchFood('Arroz integral cozido', foods)?.name).toBe('Arroz, integral, cozido');
  });

  it('ignora stopwords do termo da IA', () => {
    const foods = [f('Frango, peito, grelhado')];
    expect(matchFood('Peito de frango grelhado', foods)?.name).toBe('Frango, peito, grelhado');
  });

  it('retorna null quando nenhum alimento contém todas as palavras', () => {
    const foods = [f('Arroz, integral, cozido')];
    expect(matchFood('Pizza congelada', foods)).toBeNull();
  });

  it('NÃO casa uma única palavra comum num nome multi-ingrediente', () => {
    const foods = [f('Frango, peito, grelhado')];
    expect(matchFood('Frango', foods)).toBeNull();
  });

  it('casa uma palavra única só num alimento de nome de 1 palavra', () => {
    const foods = [f('Banana'), f('Frango, peito, grelhado')];
    expect(matchFood('Banana', foods)?.name).toBe('Banana');
  });
});
```

Run: `pnpm --filter @nutri-plus/api test -- food-matcher` → FAIL.

- [ ] **Step 2: Implementar** — `apps/api/src/meal-generation/food-matcher.ts`:

```ts
import { normalizeSearch } from '../foods/normalize';

// Conectivos pt-BR ignorados no casamento (não são "palavras de conteúdo").
const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'com', 'e', 'em', 'no', 'na', 'ao', 'a', 'o',
]);

function tokens(s: string): string[] {
  return normalizeSearch(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

function contentTokens(s: string): string[] {
  return tokens(s).filter((t) => !STOPWORDS.has(t));
}

// Casa o nome livre da IA a um Food por SUBCONJUNTO de tokens: todas as palavras de
// conteúdo do termo aparecem nos tokens do searchName do Food. Escolhe o mais
// específico (menos tokens no total; desempate por nome). Alta confiança: um termo
// de 1 palavra só casa um alimento cujo conteúdo seja exatamente aquela palavra —
// evita "Frango" casar "Frango, peito, grelhado". Sem candidato → null.
export function matchFood<T extends { name: string; searchName: string }>(
  foodName: string,
  foods: T[],
): T | null {
  const query = contentTokens(foodName);
  if (query.length === 0) return null;
  const single = query.length === 1;

  let best: T | null = null;
  let bestSize = Infinity;
  for (const food of foods) {
    const fset = new Set(tokens(food.searchName));
    if (!query.every((t) => fset.has(t))) continue;
    if (single) {
      const fcontent = contentTokens(food.searchName);
      if (!(fcontent.length === 1 && fcontent[0] === query[0])) continue;
    }
    const size = fset.size;
    if (size < bestSize || (size === bestSize && best !== null && food.name < best.name)) {
      best = food;
      bestSize = size;
    }
  }
  return best;
}
```

- [ ] **Step 3: Rodar e ver passar**

Run: `pnpm --filter @nutri-plus/api test -- food-matcher`
Expected: PASS (6 testes).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/meal-generation/food-matcher.ts apps/api/src/meal-generation/food-matcher.spec.ts
git commit -m "feat(api): food matcher (name -> TACO Food, token-subset, high confidence)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Schema `grams` + prompt + ancoragem no `generate`

**Files:**
- Modify: `apps/api/src/meal-generation/schema/meal-plan-response.schema.ts` + `meal-plan-response.schema.spec.ts`
- Modify: `apps/api/src/ai/prompts/meal-plan.prompt.ts`
- Modify: `apps/api/src/meal-plans/meal-plans.service.ts` (`GeneratedMealInput` item += campos)
- Modify: `apps/api/src/meal-generation/meal-generation.service.ts` (matching + macros no `generate`)
- Test: `apps/api/src/meal-generation/meal-generation.service.spec.ts`

**Interfaces:**
- Consumes: `matchFood` (Task 2); `macrosForPortion` (de `@nutri-plus/shared-types`, A2); o modelo Prisma `Food`.
- Produces: itens gerados ancorados (`foodId`/`grams`/macros reais) ou texto-livre.

- [ ] **Step 1: `grams` no schema** — em `apps/api/src/meal-generation/schema/meal-plan-response.schema.ts`, no objeto do item, adicionar `grams` após `fats`:
```ts
                    foodName: z.string(),
                    quantity: z.string(),
                    grams: z.number(),
                    calories: z.number(),
                    protein: z.number(),
                    carbs: z.number(),
                    fats: z.number(),
```
Atualizar `meal-plan-response.schema.spec.ts`: no fixture de item válido, incluir `grams` (ex.: `grams: 100`); adicionar uma asserção de que um item **sem** `grams` é rejeitado pelo `.parse`.

- [ ] **Step 2: Prompt instrui gramas + alimentos comuns** — em `apps/api/src/ai/prompts/meal-plan.prompt.ts`, dentro do array `MEAL_PLAN_SYSTEM_PROMPT`, adicionar (após a linha `'For EACH food item, estimate its macros: ...'`) duas linhas:
```ts
  'For EACH food item ALSO provide "grams": the portion size in grams as a number.',
  'Prefer single, common Brazilian foods by their usual name (e.g. "Arroz integral',
  'cozido", "Peito de frango grelhado") rather than composite dishes, so items map',
  'to a food-composition table.',
```

- [ ] **Step 3: `GeneratedMealInput` item += campos** — em `apps/api/src/meal-plans/meal-plans.service.ts`, no `interface GeneratedMealInput`, no tipo do item, adicionar os 4 campos opcionais:
```ts
export interface GeneratedMealInput {
  name: string;
  timeLabel?: string;
  options: {
    label?: string;
    items: {
      foodName: string;
      quantity: string;
      calories: number;
      protein: number;
      carbs: number;
      fats: number;
      foodId?: string;
      grams?: number;
      fiber?: number;
      sodium?: number;
    }[];
  }[];
}
```
(O `mealsCreateInput` já faz `{ ...it, order: k }` — os campos novos persistem nas colunas do A2. Nenhuma outra mudança aqui.)

- [ ] **Step 4: Ancoragem no `generate`** — em `apps/api/src/meal-generation/meal-generation.service.ts`:

Adicionar imports:
```ts
import { computeAge, computeTargets, NutritionInputs, Gender, PatientObjective, ActivityLevel, macrosForPortion } from '@nutri-plus/shared-types';
import { Food } from '../generated/prisma/client';
import { matchFood } from './food-matcher';
```
(junte `macrosForPortion` ao import do shared-types que a Task 1 criou; adicione `Food` e `matchFood`.)

Adicionar o helper privado (perto de `requireInputs`):
```ts
  // Ancora um item da IA a um Food do TACO: no match, grava foodId + nome canônico
  // + macros RECALCULADOS por macrosForPortion (autoridade server-side; a estimativa
  // da IA é descartada). Sem match, mantém o item de texto livre de hoje.
  private groundItem(
    it: {
      foodName: string;
      quantity: string;
      grams: number;
      calories: number;
      protein: number;
      carbs: number;
      fats: number;
    },
    foods: Food[],
  ): GeneratedMealInput['options'][number]['items'][number] {
    const food = matchFood(it.foodName, foods);
    if (!food) {
      return {
        foodName: it.foodName,
        quantity: it.quantity,
        calories: it.calories,
        protein: it.protein,
        carbs: it.carbs,
        fats: it.fats,
      };
    }
    const m = macrosForPortion(food, it.grams);
    return {
      foodName: food.name,
      foodId: food.id,
      grams: it.grams,
      quantity: '',
      calories: m.calories,
      protein: m.protein,
      carbs: m.carbs,
      fats: m.fats,
      fiber: m.fiber,
      sodium: m.sodium,
    };
  }
```

No `generate`, entre a resposta da IA e o `createGeneratedPlan`, carregar os foods uma vez e mapear via `groundItem`. Substituir o `return this.mealPlans.createGeneratedPlan(...)` final por:
```ts
    const foods = await this.prisma.food.findMany();

    return this.mealPlans.createGeneratedPlan(ctx, {
      patientId,
      title: generated.title,
      targets,
      meals: generated.meals.map((m): GeneratedMealInput => ({
        name: m.name,
        timeLabel: m.timeLabel ?? undefined,
        options: m.options.map((o) => ({
          label: o.label,
          items: o.items.map((it) => this.groundItem(it, foods)),
        })),
      })),
    });
```
(O `adjust` **não** muda: continua mapeando `o.items` direto para o rascunho. O `grams` do schema flui pro rascunho de forma inócua.)

- [ ] **Step 5: Teste do fluxo de ancoragem** — em `apps/api/src/meal-generation/meal-generation.service.spec.ts`:
- No fixture `aiResponse`, adicionar `grams` a cada item (ex.: o item "Ovos" → `grams: 100`; "Tapioca" → `grams: 60`). Renomear/ajustar um item para casar um Food mockado (ex.: `foodName: 'Ovo de galinha'`, `grams: 100`).
- Mockar `prisma.food.findMany.mockResolvedValue([...])` com um Food que casa o item (ex.: `{ id: 'food-ovo', name: 'Ovo, de galinha, inteiro, cru', searchName: 'ovo, de galinha, inteiro, cru', energyKcal: 143, protein: 13, carbohydrate: 1.6, lipid: 9, fiber: 0, sodium: 140, tacoId: null, group: null, createdAt: new Date() }`) e um item que NÃO casa (o outro item da IA).
- Asserção 1 (ancorado): na chamada a `mealPlans.createGeneratedPlan`, o item casado tem `foodId: 'food-ovo'`, `foodName: 'Ovo, de galinha, inteiro, cru'`, `grams: 100`, e os macros iguais a `macrosForPortion(food, 100)` (ex.: `calories: 143`, `protein: 13`, `fiber: 0`, `sodium: 140`) — **não** os estimados pela IA.
- Asserção 2 (fallback): o item não casado é gravado como texto-livre (sem `foodId`, com os macros estimados da IA).
- Asserção 3 (targets idênticos): `targets` passado ao `createGeneratedPlan` é o mesmo de hoje (`computeTargets` inalterado). Mockar `mealPlans.createGeneratedPlan.mockResolvedValue({} as any)` e inspecionar o argumento via `createGeneratedPlan.mock.calls[0][1]`.

Run: `pnpm --filter @nutri-plus/api test -- meal-generation meal-plan-response` → PASS.

- [ ] **Step 6: Verificação de todas as áreas + commit**

Run:
```
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```
Expected: shared-types build limpo; API verde + tsc 0; web tsc 0; mobile tsc 0 (o schema/grounding não toca web/mobile; `grams` no shared-type é aditivo).
```bash
git add apps/api/src/meal-generation/schema/meal-plan-response.schema.ts apps/api/src/meal-generation/schema/meal-plan-response.schema.spec.ts apps/api/src/ai/prompts/meal-plan.prompt.ts apps/api/src/meal-plans/meal-plans.service.ts apps/api/src/meal-generation/meal-generation.service.ts apps/api/src/meal-generation/meal-generation.service.spec.ts
git commit -m "feat(api): ground AI meal generation in the TACO catalog (match + server macros)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificação final

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test && pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```

Manual (dev DB do A1 semeada + paciente com dados p/ gerar): gerar um plano por IA → itens de alimentos comuns aparecem **ancorados** (nome canônico do TACO, com fibra/sódio e macros consistentes) no editor; itens não reconhecidos ficam texto-livre; a geração nunca falha; os targets diários seguem iguais aos de hoje. O `adjust` segue produzindo rascunho de texto-livre.

## Notas

- Behavior-preserving na consolidação: os valores de `computeTargets`/`computeBmr`/`computeAge` são idênticos (o spec movido prova isso). `energy.ts` fica intacto.
- Precisão do matcher é conservadora (alta confiança) — prefere não casar a casar errado; o fallback texto-livre garante que nada quebra. Melhorar a cobertura do match é um refinamento futuro.
