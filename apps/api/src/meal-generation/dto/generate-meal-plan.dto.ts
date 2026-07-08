import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class GenerateMealPlanDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}
