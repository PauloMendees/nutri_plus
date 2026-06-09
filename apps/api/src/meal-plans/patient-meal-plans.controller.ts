import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { MealPlansService } from './meal-plans.service';

@ApiTags('meal-plans')
@ApiBearerAuth()
@Controller({ path: 'me/meal-plans', version: '1' })
@Roles(UserRole.PATIENT)
export class PatientMealPlansController {
  constructor(private readonly mealPlans: MealPlansService) {}

  @Get()
  list(@CurrentUser() ctx: AuthContext) {
    return this.mealPlans.listMyPlans(ctx);
  }

  @Get(':id')
  findOne(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.mealPlans.getMyPlan(ctx, id);
  }
}
