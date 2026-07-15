import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxDate,
  MaxLength,
  Min,
} from 'class-validator';

// Every field optional. Most body metrics are >= 0 (zero is meaningful for some
// indices), but weight and basalMetabolicRate must be strictly positive (zero is
// a data error). assessmentDate defaults to now() in the DB when omitted.
export class CreateAssessmentDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MaxDate(() => new Date(), { message: 'assessmentDate cannot be in the future' })
  assessmentDate?: Date;

  @IsOptional()
  @IsPositive()
  weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bodyFatPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  muscleMass?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leanMass?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  muscleMassPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leanMassPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  visceralFat?: number;

  @IsOptional()
  @IsPositive()
  basalMetabolicRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bodyWaterPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  boneMass?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  metabolicAge?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  waistCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hipCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  chestCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  armCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  thighCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  abdomenCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  contractedArmCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  calfCircumference?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
