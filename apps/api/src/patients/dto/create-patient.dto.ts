import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UpdatePatientDto } from './update-patient.dto';

// Inherits optional clinical fields from UpdatePatientDto. Name is required;
// email and phone are optional — create writes a ficha, not an invited account.
export class CreatePatientDto extends UpdatePatientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  demo?: boolean;
}
