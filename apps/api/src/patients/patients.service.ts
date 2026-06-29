import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { UsersService } from '../users/users.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';

const USER_SUMMARY = { select: { id: true, name: true, email: true } } as const;

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  // Registers a patient during the consultation: invite via the Supabase Admin
  // API (creates the auth identity + emails the patient), then create the linked
  // local record. If the local write fails, the invited auth user is rolled back.
  async createPatient(ctx: AuthContext, dto: CreatePatientDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const { name, email, ...clinical } = dto;

    const { id: authProviderId } = await this.supabaseAdmin.inviteUser(email, {
      name,
    });

    let profileId: string;
    try {
      const localUser = await this.users.createInvitedPatient({
        authProviderId,
        email,
        name,
        nutritionistId,
        clinical,
      });
      // A patient is always created with a nested profile, so this is non-null.
      profileId = localUser.patientProfile!.id;
    } catch (error) {
      await this.supabaseAdmin.deleteUser(authProviderId);
      throw error;
    }

    return this.getPatient(ctx, profileId);
  }

  async listPatients(ctx: AuthContext) {
    return this.prisma.patientProfile.findMany({
      where: { nutritionistId: resolveScopeNutritionistId(ctx) },
      include: { user: USER_SUMMARY },
    });
  }

  async getPatient(ctx: AuthContext, id: string) {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      include: {
        user: USER_SUMMARY,
        assessments: { orderBy: { assessmentDate: 'desc' }, take: 1 },
      },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return patient;
  }

  async updatePatient(ctx: AuthContext, id: string, dto: UpdatePatientDto) {
    await this.requireOwned(ctx, id);
    // Check-then-act is acceptable here: a nutritionist only ever touches their
    // own patients and patient re-assignment is out of MVP scope. update() must
    // target by primary key, so ownership can't be folded into this call.
    // Return the full PatientDetail shape (same include as getPatient) so the
    // PATCH response matches its declared type and clients can cache it without
    // losing the user/assessments relations.
    return this.prisma.patientProfile.update({
      where: { id },
      data: dto,
      include: {
        user: USER_SUMMARY,
        assessments: { orderBy: { assessmentDate: 'desc' }, take: 1 },
      },
    });
  }

  async createAssessment(ctx: AuthContext, id: string, dto: CreateAssessmentDto) {
    await this.requireOwned(ctx, id);
    return this.prisma.bodyAssessment.create({
      data: { ...dto, patientId: id },
    });
  }

  async listAssessments(ctx: AuthContext, id: string) {
    await this.requireOwned(ctx, id);
    return this.prisma.bodyAssessment.findMany({
      where: {
        patientId: id,
        patient: { nutritionistId: resolveScopeNutritionistId(ctx) },
      },
      orderBy: { assessmentDate: 'desc' },
    });
  }

  async updateAssessment(
    ctx: AuthContext,
    patientId: string,
    assessmentId: string,
    dto: UpdateAssessmentDto,
  ) {
    await this.requireOwned(ctx, patientId);
    await this.requireAssessment(patientId, assessmentId);
    return this.prisma.bodyAssessment.update({
      where: { id: assessmentId },
      data: dto,
    });
  }

  async removeAssessment(
    ctx: AuthContext,
    patientId: string,
    assessmentId: string,
  ): Promise<void> {
    await this.requireOwned(ctx, patientId);
    await this.requireAssessment(patientId, assessmentId);
    await this.prisma.bodyAssessment.delete({ where: { id: assessmentId } });
  }

  // The assessment must belong to the (already-owned) patient; otherwise 404.
  private async requireAssessment(patientId: string, assessmentId: string): Promise<void> {
    const assessment = await this.prisma.bodyAssessment.findFirst({
      where: { id: assessmentId, patientId },
      select: { id: true },
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
  }

  // Confirms the patient exists AND is linked to this nutritionist. A non-owned
  // id looks identical to a missing one (404) so existence does not leak.
  private async requireOwned(ctx: AuthContext, id: string): Promise<void> {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
  }
}
