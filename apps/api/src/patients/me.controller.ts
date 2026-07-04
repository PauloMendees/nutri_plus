import { Controller, Delete, Get, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { PatientsService } from './patients.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
@Roles(UserRole.PATIENT)
export class MeController {
  constructor(private readonly patients: PatientsService) {}

  @Get('nutritionist')
  getNutritionist(@CurrentUser() ctx: AuthContext) {
    return this.patients.getMyNutritionist(ctx);
  }

  @Delete()
  @HttpCode(204)
  deleteAccount(@CurrentUser() ctx: AuthContext) {
    return this.patients.deleteMyAccount(ctx);
  }
}
