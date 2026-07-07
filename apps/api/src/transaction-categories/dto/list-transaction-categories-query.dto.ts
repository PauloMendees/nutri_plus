import { IsEnum, IsOptional } from 'class-validator';
import { TransactionType } from '../../generated/prisma/client';

export class ListTransactionCategoriesQueryDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;
}
