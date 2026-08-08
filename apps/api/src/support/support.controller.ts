import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { SupportResponse } from '@nutri-plus/shared-types';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { BillingExempt } from '../billing/decorators';
import { CreateSupportDto } from './dto/create-support.dto';
import { SupportService } from './support.service';

@ApiTags('support')
@ApiBearerAuth()
@Controller({ path: 'support', version: '1' })
@Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
@BillingExempt()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  submit(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: CreateSupportDto,
  ): Promise<SupportResponse> {
    const user = ctx.user!;
    return this.support.submit({
      replyTo: dto.replyTo,
      category: dto.category,
      description: dto.description,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  }
}
