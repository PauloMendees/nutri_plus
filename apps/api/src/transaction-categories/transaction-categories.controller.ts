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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { TransactionCategoriesService } from './transaction-categories.service';
import { CreateTransactionCategoryDto } from './dto/create-transaction-category.dto';
import { UpdateTransactionCategoryDto } from './dto/update-transaction-category.dto';
import { ListTransactionCategoriesQueryDto } from './dto/list-transaction-categories-query.dto';

@ApiTags('transaction-categories')
@ApiBearerAuth()
@Controller({ path: 'transaction-categories', version: '1' })
@Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
export class TransactionCategoriesController {
  constructor(private readonly categories: TransactionCategoriesService) {}

  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreateTransactionCategoryDto) {
    return this.categories.create(ctx, dto);
  }

  @Get()
  list(@CurrentUser() ctx: AuthContext, @Query() query: ListTransactionCategoriesQueryDto) {
    return this.categories.list(ctx, query.type);
  }

  @Get(':id')
  findOne(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.getOne(ctx, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionCategoryDto,
  ) {
    return this.categories.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(ctx, id);
  }
}
