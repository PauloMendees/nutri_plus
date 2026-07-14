import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class AdjustMealPlanDto {
  @IsUUID()
  planId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  instructions!: string;
}
