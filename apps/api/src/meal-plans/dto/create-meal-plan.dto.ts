import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MealDto } from './meal.dto';

// patientId is the only required field — the ownership anchor. Everything else is
// optional so a nutritionist can save a partial draft and finish later. A minimal
// valid body is `{ patientId }`. aiGenerated is NOT accepted from input (the global
// ValidationPipe rejects it with a 400); the server always sets false in Step 04.
export class CreateMealPlanDto {
  @IsUUID()
  patientId!: string;

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
