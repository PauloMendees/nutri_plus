import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { PatientsService } from './patients.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';

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

  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreateAssessmentDto) {
    return this.patients.createMyAssessment(ctx, dto);
  }
}
