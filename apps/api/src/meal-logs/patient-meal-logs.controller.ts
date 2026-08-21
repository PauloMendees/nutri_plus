import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { MealLogsService } from './meal-logs.service';
import { ListMealLogsQueryDto } from './dto/list-meal-logs-query.dto';

@ApiTags('meal-logs')
@ApiBearerAuth()
@Controller({ path: 'patients/:patientId/meal-logs', version: '1' })
@Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
export class PatientMealLogsController {
  constructor(private readonly mealLogs: MealLogsService) {}

  @Get()
  list(
    @CurrentUser() ctx: AuthContext,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: ListMealLogsQueryDto,
  ) {
    return this.mealLogs.listForPatient(ctx, patientId, query);
  }
}
