import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { PatientsService } from './patients.service';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { CreatePatientDto } from './dto/create-patient.dto';

@ApiTags('patients')
@ApiBearerAuth()
@Controller({ path: 'patients', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreatePatientDto) {
    return this.patients.createPatient(ctx, dto);
  }

  @Get()
  list(@CurrentUser() ctx: AuthContext) {
    return this.patients.listPatients(ctx);
  }

  @Get(':id')
  findOne(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.patients.getPatient(ctx, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patients.updatePatient(ctx, id, dto);
  }

  @Post(':id/assessments')
  createAssessment(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateAssessmentDto,
  ) {
    return this.patients.createAssessment(ctx, id, dto);
  }

  @Get(':id/assessments')
  listAssessments(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.patients.listAssessments(ctx, id);
  }
}
