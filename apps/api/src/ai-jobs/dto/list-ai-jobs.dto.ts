import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListAiJobsDto {
  // Opcional: sem paciente, lista os trabalhos do nutricionista inteiro — é o
  // que o widget global consome, já que ele aparece fora da página do paciente.
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  patientId?: string;
}
