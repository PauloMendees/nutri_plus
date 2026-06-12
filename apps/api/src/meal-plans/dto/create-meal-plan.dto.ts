import { IsUUID } from 'class-validator';
import { UpdateMealPlanDto } from './update-meal-plan.dto';

// patientId is the only required field — the ownership anchor. The optional content
// fields (title, objective, meals) are inherited from UpdateMealPlanDto, mirroring
// CreatePatientDto extends UpdatePatientDto. A minimal valid body is `{ patientId }`.
// aiGenerated is NOT accepted from input (the global ValidationPipe rejects it with a
// 400); the server always sets false in Step 04.
export class CreateMealPlanDto extends UpdateMealPlanDto {
  @IsUUID()
  patientId!: string;
}
