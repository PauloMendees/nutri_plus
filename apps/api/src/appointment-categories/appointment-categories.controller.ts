import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { AppointmentCategoriesService } from './appointment-categories.service';
import { CreateAppointmentCategoryDto } from './dto/create-appointment-category.dto';
import { UpdateAppointmentCategoryDto } from './dto/update-appointment-category.dto';

@ApiTags('appointment-categories')
@ApiBearerAuth()
@Controller({ path: 'appointment-categories', version: '1' })
@Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
export class AppointmentCategoriesController {
  constructor(private readonly categories: AppointmentCategoriesService) {}

  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreateAppointmentCategoryDto) {
    return this.categories.create(ctx, dto);
  }

  @Get()
  list(@CurrentUser() ctx: AuthContext) {
    return this.categories.list(ctx);
  }

  @Get(':id')
  findOne(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.getOne(ctx, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentCategoryDto,
  ) {
    return this.categories.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(ctx, id);
  }
}
