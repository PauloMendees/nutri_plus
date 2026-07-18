import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { NutritionTargetsService } from './nutrition-targets.service';
import { CreateNutritionTargetDto } from './dto/create-nutrition-target.dto';

@ApiTags('nutrition-targets')
@ApiBearerAuth()
@Controller({ path: 'patients/:id/nutrition-targets', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class NutritionTargetsController {
  constructor(private readonly service: NutritionTargetsService) {}

  @Post()
  create(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateNutritionTargetDto,
  ) {
    return this.service.create(ctx, id, dto);
  }

  @Get()
  list(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.service.list(ctx, id);
  }
}
