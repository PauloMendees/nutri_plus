import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { RATE_LIMITS, perMinute } from '../common/rate-limit/rate-limit.policy';
import { OutsideHomeService } from './outside-home.service';
import { CreateOutsideHomeDto } from './dto/create-outside-home.dto';

@ApiTags('outside-home')
@ApiBearerAuth()
@Controller({ path: 'me/outside-home', version: '1' })
@Roles(UserRole.PATIENT)
export class OutsideHomeController {
  constructor(private readonly outsideHome: OutsideHomeService) {}

  @Post()
  @Throttle(perMinute(RATE_LIMITS.outsideHome))
  suggest(@CurrentUser() ctx: AuthContext, @Body() dto: CreateOutsideHomeDto) {
    return this.outsideHome.suggest(ctx, dto);
  }
}
