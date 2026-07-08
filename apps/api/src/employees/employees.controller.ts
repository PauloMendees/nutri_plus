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
import { EmployeesService } from './employees.service';
import { InviteEmployeeDto } from './dto/invite-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@ApiTags('employees')
@ApiBearerAuth()
@Controller({ path: 'employees', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Post()
  invite(@CurrentUser() ctx: AuthContext, @Body() dto: InviteEmployeeDto) {
    return this.employees.inviteEmployee(ctx, dto);
  }

  @Get()
  list(@CurrentUser() ctx: AuthContext) {
    return this.employees.listEmployees(ctx);
  }

  @Patch(':id')
  update(
    @CurrentUser() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.updateEmployee(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.employees.removeEmployee(ctx, id);
  }
}
