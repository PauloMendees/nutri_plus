import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MealDto } from './meal.dto';

// No patientId: plan reassignment is out of MVP scope. If `meals` is present the
// whole meals/items tree is replaced; if omitted, only the provided top-level
// fields change.
export class UpdateMealPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  objective?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MealDto)
  meals?: MealDto[];
}
