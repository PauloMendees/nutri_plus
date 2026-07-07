import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { TransactionType } from '../../generated/prisma/client';

export class CreateTransactionCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsEnum(TransactionType)
  type!: TransactionType;
}
