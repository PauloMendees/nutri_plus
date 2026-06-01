import { IsEnum, IsOptional, Matches } from 'class-validator';
import { UserRole } from '@prisma/client';

export class SyncUserDto {
  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @Matches(/^NUTRI-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/, {
    message: 'referralCode must match NUTRI-XXXXX',
  })
  referralCode?: string;
}
