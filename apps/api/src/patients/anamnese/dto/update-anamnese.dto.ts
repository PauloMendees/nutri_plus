import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateAnamneseDto {
  @IsOptional() @IsString() @MaxLength(2000) mainComplaint?: string;
  @IsOptional() @IsString() @MaxLength(2000) medications?: string;
  @IsOptional() @IsString() @MaxLength(2000) familyHistory?: string;
  @IsOptional() @IsString() @MaxLength(2000) supplements?: string;
  @IsOptional() @IsNumber() @Min(0) sleepHoursPerNight?: number;
  @IsOptional() @IsNumber() @Min(0) waterIntakeLiters?: number;
  @IsOptional() @IsString() @MaxLength(500) alcoholUse?: string;
  @IsOptional() @IsString() @MaxLength(500) smoking?: string;
  @IsOptional() @IsString() @MaxLength(2000) physicalActivity?: string;
  @IsOptional() @IsString() @MaxLength(2000) bowelHabit?: string;
  @IsOptional() @IsInt() @Min(0) mealsPerDay?: number;
  @IsOptional() @IsString() @MaxLength(2000) eatingHabits?: string;
  @IsOptional() @IsString() @MaxLength(2000) foodPreferences?: string;
  @IsOptional() @IsString() @MaxLength(2000) clinicalNotes?: string;
}
