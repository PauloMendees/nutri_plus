import { IsUUID } from 'class-validator';
import { UpdateFoodRecallDto } from './update-food-recall.dto';

// patientId is the only required field — the ownership anchor. The optional content
// fields (recallDate, notes, meals) are inherited from UpdateFoodRecallDto, mirroring
// CreateMealPlanDto extends UpdateMealPlanDto.
export class CreateFoodRecallDto extends UpdateFoodRecallDto {
  @IsUUID()
  patientId!: string;
}
