import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsPositive,
  IsString,
  MaxDate,
  MaxLength,
} from 'class-validator';
import {
  ActivityLevel,
  Gender,
  PatientObjective,
} from '../../generated/prisma/client';

// All fields optional: PATCH applies a partial update. Only these clinical
// fields are writable; the global ValidationPipe (forbidNonWhitelisted) rejects
// anything else (e.g. userId, nutritionistId) with a 400.
export class UpdatePatientDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MaxDate(() => new Date(), { message: 'birthDate cannot be in the future' })
  birthDate?: Date;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsPositive()
  height?: number;

  @IsOptional()
  @IsPositive()
  targetWeight?: number;

  @IsOptional()
  @IsEnum(PatientObjective)
  objective?: PatientObjective;

  @IsOptional()
  @IsEnum(ActivityLevel)
  activityLevel?: ActivityLevel;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  restrictions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  allergies?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  medicalConditions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
