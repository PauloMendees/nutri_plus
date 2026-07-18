import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { NutritionTargetsService } from './nutrition-targets.service';

@ApiTags('nutrition-targets')
@ApiBearerAuth()
@Controller({ path: 'me/nutrition-target', version: '1' })
@Roles(UserRole.PATIENT)
export class MeNutritionTargetController {
  constructor(private readonly service: NutritionTargetsService) {}

  @Get()
  get(@CurrentUser() ctx: AuthContext) {
    return this.service.getMineForPatient(ctx);
  }
}
