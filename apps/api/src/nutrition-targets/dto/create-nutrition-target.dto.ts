import { IsEnum, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ActivityLevel, Gender, TmbFormula } from '@nutri-plus/shared-types';

export class CreateNutritionTargetDto {
  @IsEnum(TmbFormula)
  formula!: TmbFormula;

  // Biological sex used for the estimate — resolved in the form; only M/F allowed.
  @IsIn([Gender.MALE, Gender.FEMALE])
  sex!: Gender;

  @IsOptional() @IsNumber() @Min(0) @Max(120)
  age?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(300)
  heightCm?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(500)
  weightKg?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  bodyFatPercentage?: number;
  @IsOptional() @IsEnum(ActivityLevel)
  activityLevel?: ActivityLevel;

  @IsNumber() @Min(0) @Max(20000)
  targetCalories!: number;
  @IsNumber() @Min(0) @Max(10)
  proteinGramsPerKg!: number;
  @IsNumber() @Min(0) @Max(100)
  fatPercent!: number;
}
