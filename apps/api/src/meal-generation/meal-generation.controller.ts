import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { AiJobsService } from '../ai-jobs/ai-jobs.service';
import { GenerateMealPlanDto } from './dto/generate-meal-plan.dto';
import { AdjustMealPlanDto } from './dto/adjust-meal-plan.dto';

@ApiTags('ai')
@ApiBearerAuth()
@Controller({ path: 'ai', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class MealGenerationController {
  constructor(private readonly jobs: AiJobsService) {}

  // 202: o trabalho roda em segundo plano; o cliente acompanha por GET /ai/jobs/:id.
  @Post('generate-meal-plan')
  @HttpCode(202)
  generateMealPlan(@CurrentUser() ctx: AuthContext, @Body() dto: GenerateMealPlanDto) {
    return this.jobs.create(ctx, {
      type: 'MEAL_PLAN_GENERATION',
      patientId: dto.patientId,
      instructions: dto.instructions,
    });
  }

  @Post('adjust-meal-plan')
  @HttpCode(202)
  async adjustMealPlan(@CurrentUser() ctx: AuthContext, @Body() dto: AdjustMealPlanDto) {
    return this.jobs.createForPlan(ctx, dto.planId, dto.instructions);
  }
}
