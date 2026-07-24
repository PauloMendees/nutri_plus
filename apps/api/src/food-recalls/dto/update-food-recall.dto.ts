import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { RecallMealDto } from './recall-meal.dto';

// No patientId: recall reassignment is out of scope. If `meals` is present the
// whole meals/items tree is replaced; if omitted, only the provided top-level
// fields change.
export class UpdateFoodRecallDto {
  @IsOptional()
  @IsDateString()
  recallDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecallMealDto)
  meals?: RecallMealDto[];
}
