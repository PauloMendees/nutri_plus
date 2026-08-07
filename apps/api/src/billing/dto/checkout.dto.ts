import { IsIn, IsString, Matches } from 'class-validator';
import type { BillingPeriod, PlanTier } from '@nutri-plus/shared-types';

export class CheckoutDto {
  @IsIn(['ESSENCIAL', 'PRO'])
  plan!: PlanTier;

  @IsIn(['MONTHLY', 'YEARLY'])
  period!: BillingPeriod;

  // CPF (11) ou CNPJ (14), só dígitos após normalização no cliente.
  @IsString()
  @Matches(/^\d{11}$|^\d{14}$/, { message: 'cpfCnpj deve ter 11 (CPF) ou 14 (CNPJ) dígitos' })
  cpfCnpj!: string;
}
