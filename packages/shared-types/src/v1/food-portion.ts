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
