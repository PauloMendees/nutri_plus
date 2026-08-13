import { Type } from 'class-transformer';
import { IsIn, IsObject, IsString, Matches, ValidateIf, ValidateNested } from 'class-validator';
import type { BillingPeriod, CardHolderInfo, CardInput, PaymentMethod, PlanTier } from '@nutri-plus/shared-types';

export class CardDto implements CardInput {
  @IsString() holderName!: string;
  @Matches(/^\d{13,19}$/, { message: 'número de cartão inválido' }) number!: string;
  @Matches(/^\d{2}$/) expiryMonth!: string;
  @Matches(/^\d{4}$/) expiryYear!: string;
  @Matches(/^\d{3,4}$/) ccv!: string;
}

export class HolderInfoDto implements CardHolderInfo {
  @Matches(/^\d{8}$/, { message: 'CEP deve ter 8 dígitos' }) postalCode!: string;
  @IsString() addressNumber!: string;
  @Matches(/^\d{10,11}$/, { message: 'telefone inválido' }) phone!: string;
}

export class CheckoutDto {
  @IsIn(['ESSENCIAL', 'PRO']) plan!: PlanTier;
  @IsIn(['MONTHLY', 'YEARLY']) period!: BillingPeriod;
  @IsString() @Matches(/^\d{11}$|^\d{14}$/, { message: 'cpfCnpj deve ter 11 (CPF) ou 14 (CNPJ) dígitos' }) cpfCnpj!: string;
  @IsIn(['PIX', 'CREDIT_CARD']) method!: PaymentMethod;

  @ValidateIf((o) => o.method === 'CREDIT_CARD')
  @IsObject() @ValidateNested() @Type(() => CardDto) card?: CardDto;

  @ValidateIf((o) => o.method === 'CREDIT_CARD')
  @IsObject() @ValidateNested() @Type(() => HolderInfoDto) holderInfo?: HolderInfoDto;
}
