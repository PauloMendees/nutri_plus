import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
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
  @Max(500)
  weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  bodyFatPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  muscleMass?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  leanMass?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  muscleMassPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  leanMassPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  visceralFat?: number;

  @IsOptional()
  @IsPositive()
  @Max(10000)
  basalMetabolicRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  bodyWaterPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20)
  boneMass?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  metabolicAge?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  waistCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  hipCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  chestCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  armCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  thighCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  abdomenCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  contractedArmCircumference?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  calfCircumference?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
