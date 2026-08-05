import { Type } from 'class-transformer';
import { IsIn, IsObject, IsString, Matches, ValidateIf, ValidateNested } from 'class-validator';
import type { PaymentMethod } from '@nutri-plus/shared-types';
import { CardDto, HolderInfoDto } from './checkout.dto';

export class PaymentMethodDto {
  @IsIn(['PIX', 'CREDIT_CARD']) method!: PaymentMethod;
  // CPF só é exigido ao (re)tokenizar cartão; mudar p/ Pix não precisa dele.
  @ValidateIf((o) => o.method === 'CREDIT_CARD')
  @IsString() @Matches(/^\d{11}$|^\d{14}$/, { message: 'cpfCnpj deve ter 11 ou 14 dígitos' }) cpfCnpj?: string;
  @ValidateIf((o) => o.method === 'CREDIT_CARD') @IsObject() @ValidateNested() @Type(() => CardDto) card?: CardDto;
  @ValidateIf((o) => o.method === 'CREDIT_CARD') @IsObject() @ValidateNested() @Type(() => HolderInfoDto) holderInfo?: HolderInfoDto;
}
