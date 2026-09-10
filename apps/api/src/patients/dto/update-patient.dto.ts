import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEmail,
  IsEnum,
  IsOptional,
  IsPositive,
  IsString,
  MaxDate,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ActivityLevel,
  Gender,
  PatientObjective,
} from '../../generated/prisma/client';

// Optional clinical fields shared by create and PATCH. Identity lives on each
// subclass so create can keep name required while PATCH keeps it optional.
// The global ValidationPipe (forbidNonWhitelisted) rejects anything else
// (e.g. userId, nutritionistId) with a 400.
export class PatientClinicalDto {
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

  @IsOptional()
  @IsBoolean()
  canLogAssessments?: boolean;

  @IsOptional()
  @IsBoolean()
  showMealTargetToPatient?: boolean;
}

export class UpdatePatientDto extends PatientClinicalDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
