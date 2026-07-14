import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { PatientsService, UploadedImage } from './patients.service';
import { EvolutionPdfService } from './pdf/evolution-pdf.service';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients-query.dto';

@ApiTags('patients')
@ApiBearerAuth()
@Controller({ path: 'patients', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly evolutionPdf: EvolutionPdfService,
  ) {}

  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreatePatientDto) {
    return this.patients.createPatient(ctx, dto);
  }

  @Get()
  @Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
  list(@CurrentUser() ctx: AuthContext, @Query() query: ListPatientsQueryDto) {
    return this.patients.listPatients(ctx, query);
  }

  @Get(':id')
  @Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
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

  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadPhoto(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(png|jpe?g|webp)$/ }),
        ],
      }),
    )
    file: UploadedImage,
  ) {
    return this.patients.uploadPhoto(ctx, id, file);
  }

  @Delete(':id/photo')
  removePhoto(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.patients.removePhoto(ctx, id);
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
  @Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
  listAssessments(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.patients.listAssessments(ctx, id);
  }

  @Get(':id/assessments/pdf')
  @Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
  async assessmentsPdf(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const buffer = await this.evolutionPdf.generate(ctx, id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: 'attachment; filename="evolucao.pdf"',
    });
  }

  @Patch(':id/assessments/:assessmentId')
  updateAssessment(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Param('assessmentId') assessmentId: string,
    @Body() dto: UpdateAssessmentDto,
  ) {
    return this.patients.updateAssessment(ctx, id, assessmentId, dto);
  }

  @Delete(':id/assessments/:assessmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAssessment(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Param('assessmentId') assessmentId: string,
  ) {
    return this.patients.removeAssessment(ctx, id, assessmentId);
  }
}
