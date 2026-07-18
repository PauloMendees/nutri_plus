export interface NutritionistSettings {
  displayName: string | null;
  logoUrl: string | null;
  mealPlanAiInstructions: string | null;
  defaultCanLogAssessments: boolean;
  defaultShowMealTargetToPatient: boolean;
}

export interface UpdateNutritionistSettingsRequest {
  displayName?: string;
  mealPlanAiInstructions?: string;
  defaultCanLogAssessments?: boolean;
  defaultShowMealTargetToPatient?: boolean;
}
