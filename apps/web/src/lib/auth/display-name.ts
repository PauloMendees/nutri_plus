import { preferredNutritionistName, type MeResponse } from '@nutri-plus/shared-types';

// Nome do usuário logado no painel. Funcionários não têm nutritionistProfile e
// caem no próprio nome — o "Nome de exibição" é da nutricionista, não deles.
export function displayNameOf(me: MeResponse): string {
  return preferredNutritionistName(me.nutritionistProfile?.displayName, me.name);
}
