import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class CreateMealLogDto {
  @IsDateString()
  consumedAt!: string;

  @IsEnum(['PLAN', 'FREE_TEXT'])
  source!: 'PLAN' | 'FREE_TEXT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ValidateIf((o) => o.source === 'FREE_TEXT')
  @IsString()
  @MaxLength(1000)
  freeText?: string;

  @ValidateIf((o) => o.source === 'PLAN')
  @IsUUID()
  mealOptionId?: string;
}
