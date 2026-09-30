import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeletePatientDto {
  // Nome do paciente digitado na confirmação; obrigatório para paciente real.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  confirmName?: string;
}
