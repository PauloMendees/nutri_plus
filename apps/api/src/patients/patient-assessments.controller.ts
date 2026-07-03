import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { PatientsService } from './patients.service';

@ApiTags('assessments')
@ApiBearerAuth()
@Controller({ path: 'me/assessments', version: '1' })
@Roles(UserRole.PATIENT)
export class PatientAssessmentsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  list(@CurrentUser() ctx: AuthContext) {
    return this.patients.listMyAssessments(ctx);
  }
}
