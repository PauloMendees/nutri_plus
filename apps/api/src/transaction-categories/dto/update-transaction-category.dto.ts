import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TransactionType } from '../../generated/prisma/client';

export class UpdateTransactionCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;
}
