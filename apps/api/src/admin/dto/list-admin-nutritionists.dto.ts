import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class AdminNutritionistFiltersDto {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsIn(['yes', 'no']) confirmed?: 'yes' | 'no';
  @IsOptional() @IsIn(['COMP', 'PRO', 'ESSENCIAL', 'TRIAL', 'TRIAL_ENDED', 'EXPIRED', 'NONE'])
  plan?: 'COMP' | 'PRO' | 'ESSENCIAL' | 'TRIAL' | 'TRIAL_ENDED' | 'EXPIRED' | 'NONE';
  @IsOptional() @Matches(DAY) createdFrom?: string;
  @IsOptional() @Matches(DAY) createdTo?: string;
}

export class ListAdminNutritionistsDto extends AdminNutritionistFiltersDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
