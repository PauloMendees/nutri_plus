import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { ConsentService } from './consent.service';
import { AcceptConsentDto } from './dto/accept-consent.dto';

@ApiTags('consent')
@ApiBearerAuth()
@Controller({ path: 'me/consent', version: '1' })
@Roles(UserRole.PATIENT)
export class MeConsentController {
  constructor(private readonly service: ConsentService) {}

  @Get()
  get(@CurrentUser() ctx: AuthContext) {
    return this.service.getMine(ctx);
  }

  @Post()
  accept(@CurrentUser() ctx: AuthContext, @Body() dto: AcceptConsentDto) {
    return this.service.accept(ctx, dto);
  }
}
