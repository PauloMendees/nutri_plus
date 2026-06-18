import { IsUUID } from 'class-validator';

// patientId is the only input; all clinical data is read from stored records.
export class GenerateMealPlanDto {
  @IsUUID()
  patientId!: string;
}
