import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ListAiJobsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patientId!: string;
}
