import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

// All fields optional (draft-friendly). Macros are >= 0; 0 is a valid value.
export class MealItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  foodName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  quantity?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  calories?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  protein?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  carbs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fats?: number;

  @IsOptional()
  @IsUUID()
  foodId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  grams?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fiber?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sodium?: number;
}
