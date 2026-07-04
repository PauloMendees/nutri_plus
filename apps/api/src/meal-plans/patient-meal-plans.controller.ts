import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { MealPlansService } from './meal-plans.service';
import { MealPlanPdfService } from './meal-plan-pdf.service';

@ApiTags('meal-plans')
@ApiBearerAuth()
@Controller({ path: 'me/meal-plans', version: '1' })
@Roles(UserRole.PATIENT)
export class PatientMealPlansController {
  constructor(
    private readonly mealPlans: MealPlansService,
    private readonly mealPlanPdf: MealPlanPdfService,
  ) {}

  @Get()
  list(@CurrentUser() ctx: AuthContext) {
    return this.mealPlans.listMyPlans(ctx);
  }

  @Get(':id')
  findOne(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.mealPlans.getMyPlan(ctx, id);
  }

  @Get(':id/pdf')
  async pdf(@CurrentUser() ctx: AuthContext, @Param('id') id: string): Promise<StreamableFile> {
    const buffer = await this.mealPlanPdf.generateForPatient(ctx, id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: 'attachment; filename="plano-alimentar.pdf"',
    });
  }
}
