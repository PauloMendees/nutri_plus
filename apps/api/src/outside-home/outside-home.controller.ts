import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { OutsideHomeService } from './outside-home.service';
import { CreateOutsideHomeDto } from './dto/create-outside-home.dto';

@ApiTags('outside-home')
@ApiBearerAuth()
@Controller({ path: 'me/outside-home', version: '1' })
@Roles(UserRole.PATIENT)
export class OutsideHomeController {
  constructor(private readonly outsideHome: OutsideHomeService) {}

  @Post()
  suggest(@CurrentUser() ctx: AuthContext, @Body() dto: CreateOutsideHomeDto) {
    return this.outsideHome.suggest(ctx, dto);
  }
}
