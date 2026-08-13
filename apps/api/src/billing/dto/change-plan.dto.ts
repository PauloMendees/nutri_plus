import { IsIn } from 'class-validator';
import type { BillingPeriod, PlanTier } from '@nutri-plus/shared-types';

export class ChangePlanDto {
  @IsIn(['ESSENCIAL', 'PRO']) plan!: PlanTier;
  @IsIn(['MONTHLY', 'YEARLY']) period!: BillingPeriod;
}
