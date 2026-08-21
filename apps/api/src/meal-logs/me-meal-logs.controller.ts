import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { MealLogsService } from './meal-logs.service';
import { CreateMealLogDto } from './dto/create-meal-log.dto';
import { ListMealLogsQueryDto } from './dto/list-meal-logs-query.dto';

@ApiTags('meal-logs')
@ApiBearerAuth()
@Controller({ path: 'me/meal-logs', version: '1' })
@Roles(UserRole.PATIENT)
export class MeMealLogsController {
  constructor(private readonly mealLogs: MealLogsService) {}

  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreateMealLogDto) {
    return this.mealLogs.create(ctx, dto);
  }

  @Get()
  list(@CurrentUser() ctx: AuthContext, @Query() query: ListMealLogsQueryDto) {
    return this.mealLogs.listMine(ctx, query);
  }

  @Patch(':id')
  update(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateMealLogDto,
  ) {
    return this.mealLogs.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.mealLogs.remove(ctx, id);
  }
}
