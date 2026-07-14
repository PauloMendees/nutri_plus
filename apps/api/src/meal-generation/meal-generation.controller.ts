import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { MealGenerationService } from './meal-generation.service';
import { GenerateMealPlanDto } from './dto/generate-meal-plan.dto';
import { AdjustMealPlanDto } from './dto/adjust-meal-plan.dto';

@ApiTags('ai')
@ApiBearerAuth()
@Controller({ path: 'ai', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class MealGenerationController {
  constructor(private readonly mealGeneration: MealGenerationService) {}

  @Post('generate-meal-plan')
  generateMealPlan(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: GenerateMealPlanDto,
  ) {
    return this.mealGeneration.generate(ctx, dto.patientId, dto.instructions);
  }

  @Post('adjust-meal-plan')
  adjustMealPlan(@CurrentUser() ctx: AuthContext, @Body() dto: AdjustMealPlanDto) {
    return this.mealGeneration.adjust(ctx, dto.planId, dto.instructions);
  }
}
