import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { MealPlansService } from './meal-plans.service';
import { CreateMealPlanDto } from './dto/create-meal-plan.dto';
import { UpdateMealPlanDto } from './dto/update-meal-plan.dto';

@ApiTags('meal-plans')
@ApiBearerAuth()
@Controller({ path: 'meal-plans', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class MealPlansController {
  constructor(private readonly mealPlans: MealPlansService) {}

  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreateMealPlanDto) {
    return this.mealPlans.createPlan(ctx, dto);
  }

  @Get()
  @Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
  list(
    @CurrentUser() ctx: AuthContext,
    @Query('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.mealPlans.listPlans(ctx, patientId);
  }

  @Get(':id')
  @Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
  findOne(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.mealPlans.getPlan(ctx, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateMealPlanDto,
  ) {
    return this.mealPlans.updatePlan(ctx, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.mealPlans.deletePlan(ctx, id);
  }
}
