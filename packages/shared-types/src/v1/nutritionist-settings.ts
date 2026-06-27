export interface NutritionistSettings {
  displayName: string | null;
  logoUrl: string | null;
  mealPlanAiInstructions: string | null;
}

export interface UpdateNutritionistSettingsRequest {
  displayName?: string;
  mealPlanAiInstructions?: string;
}
