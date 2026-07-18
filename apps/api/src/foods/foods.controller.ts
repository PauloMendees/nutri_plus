import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { FoodsService } from './foods.service';

@ApiTags('foods')
@ApiBearerAuth()
@Controller({ path: 'foods', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class FoodsController {
  constructor(private readonly foods: FoodsService) {}

  @Get()
  search(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.foods.search(q ?? '', limit ? Number(limit) : undefined);
  }
}
