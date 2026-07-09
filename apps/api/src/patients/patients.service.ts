import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { NutritionistContact } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId, resolveScopePatientId } from '../auth/auth-scope';
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

  async listPatients(
    ctx: AuthContext,
    params: { search?: string; page?: number; pageSize?: number } = {},
  ) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const search = params.search?.trim();

    const where = {
      nutritionistId: resolveScopeNutritionistId(ctx),
      ...(search
        ? {
            user: {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.patientProfile.findMany({
        where,
        include: { user: USER_SUMMARY },
        orderBy: { user: { name: 'asc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.patientProfile.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
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

  // Patient-facing: the caller reads their OWN body assessments (evolution).
  // Scope resolves to the caller's own patientProfile (same seam as the
  // nutritionist surface). Read-only — a nutritionist enters assessments on web.
  async listMyAssessments(ctx: AuthContext) {
    const patientId = resolveScopePatientId(ctx);
    const assessments = await this.prisma.bodyAssessment.findMany({
      where: { patientId },
      orderBy: { assessmentDate: 'asc' },
    });
    return {
      name: ctx.name,
      height: ctx.user?.patientProfile?.height ?? null,
      assessments,
      canLog: ctx.user?.patientProfile?.canLogAssessments ?? false,
    };
  }

  // Patient-facing: the caller adds a NEW assessment for themselves. Gated by
  // the nutritionist-controlled flag — enforced here regardless of the app UI.
  async createMyAssessment(ctx: AuthContext, dto: CreateAssessmentDto) {
    const patientId = resolveScopePatientId(ctx);
    if (!ctx.user?.patientProfile?.canLogAssessments) {
      throw new ForbiddenException('Not allowed to log assessments');
    }
    return this.prisma.bodyAssessment.create({
      data: { ...dto, patientId, loggedByPatient: true },
    });
  }

  // The patient's own nutritionist, basic fields only. resolveScopePatientId
  // enforces the PATIENT scope; the linked id lives on the loaded profile.
  async getMyNutritionist(ctx: AuthContext): Promise<NutritionistContact | null> {
    resolveScopePatientId(ctx);
    const nutritionistId = ctx.user?.patientProfile?.nutritionistId ?? null;
    if (!nutritionistId) return null;

    const profile = await this.prisma.nutritionistProfile.findUnique({
      where: { id: nutritionistId },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!profile) return null;

    return {
      name: profile.user.name,
      displayName: profile.displayName,
      email: profile.user.email,
      crn: profile.crn,
      logoUrl: profile.logoUrl,
    };
  }

  // Permanently deletes the calling patient's account. Children are removed
  // first (Appointment/BodyAssessment/AIInteraction use onDelete: Restrict;
  // MealPlan children cascade), then the profile, then the local user — all in
  // one transaction. Only after it commits do we remove the Supabase auth user,
  // which frees the email for a future invite. deleteUser is best-effort (logs,
  // never throws), so a provider hiccup leaves an orphan to clean up rather than
  // resurrecting the now-deleted local data.
  async deleteMyAccount(ctx: AuthContext): Promise<void> {
    const patientId = resolveScopePatientId(ctx);
    const userId = ctx.user!.id;
    const authProviderId = ctx.user!.authProviderId;

    await this.prisma.$transaction(async (tx) => {
      await tx.outsideHomeRequest.deleteMany({ where: { patientId } });
      await tx.aIInteraction.deleteMany({ where: { patientId } });
      await tx.appointment.deleteMany({ where: { patientId } });
      await tx.bodyAssessment.deleteMany({ where: { patientId } });
      await tx.mealPlan.deleteMany({ where: { patientId } });
      await tx.patientProfile.delete({ where: { id: patientId } });
      await tx.user.delete({ where: { id: userId } });
    });

    await this.supabaseAdmin.deleteUser(authProviderId);
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
