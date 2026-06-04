import { IsEmail, IsString, MaxLength } from 'class-validator';
import { UpdatePatientDto } from './update-patient.dto';

// Inherits all the optional clinical fields from UpdatePatientDto and adds the
// two fields required to create + invite a patient.
export class CreatePatientDto extends UpdatePatientDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;
}
