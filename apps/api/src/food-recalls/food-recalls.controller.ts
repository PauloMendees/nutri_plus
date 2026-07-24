import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { FoodRecallsService } from './food-recalls.service';
import { CreateFoodRecallDto } from './dto/create-food-recall.dto';
import { UpdateFoodRecallDto } from './dto/update-food-recall.dto';

@ApiTags('food-recalls')
@ApiBearerAuth()
@Controller({ path: 'food-recalls', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class FoodRecallsController {
  constructor(private readonly service: FoodRecallsService) {}

  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreateFoodRecallDto) {
    return this.service.create(ctx, dto);
  }

  @Get()
  @Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
  list(@CurrentUser() ctx: AuthContext, @Query('patientId', ParseUUIDPipe) patientId: string) {
    return this.service.list(ctx, patientId);
  }

  @Get(':id')
  @Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
  findOne(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.service.get(ctx, id);
  }

  @Put(':id')
  update(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateFoodRecallDto,
  ) {
    return this.service.update(ctx, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.service.delete(ctx, id);
  }
}
