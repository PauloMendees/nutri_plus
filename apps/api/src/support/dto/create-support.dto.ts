import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { SUPPORT_CATEGORIES, type SupportCategory } from '@nutri-plus/shared-types';

export class CreateSupportDto {
  @IsEmail()
  replyTo!: string;

  @IsIn([...SUPPORT_CATEGORIES])
  category!: SupportCategory;

  @IsString()
  @MinLength(20, { message: 'Descrição deve ter ao menos 20 caracteres' })
  @MaxLength(4000)
  description!: string;
}
