import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateNutritionistSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  mealPlanAiInstructions?: string;
}
