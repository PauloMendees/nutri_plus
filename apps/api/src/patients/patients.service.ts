import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { NutritionistContact } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId, resolveScopePatientId } from '../auth/auth-scope';
import { UsersService } from '../users/users.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { EXT_BY_MIME, isSupportedImage, UploadedImage } from '../supabase/image-upload';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { computeImc } from './imc';

export type { UploadedImage } from '../supabase/image-upload';

const USER_SUMMARY = { select: { id: true, name: true, email: true } } as const;

const PHOTO_BUCKET = 'patient-photos';

const PATIENT_DETAIL_INCLUDE = {
  user: USER_SUMMARY,
  assessments: { orderBy: { assessmentDate: 'desc' as const }, take: 1 },
  consents: { orderBy: { acceptedAt: 'desc' as const }, take: 1 },
} as const;

// listPatients only ever needs the fields folded into PatientSummary (user +
// latest assessment for imc). It must NOT include consents: PatientSummary
// has no field for it, so reusing PATIENT_DETAIL_INCLUDE here would leak the
// raw consents relation (policyVersion/acceptedAt) into every list row.
const PATIENT_LIST_INCLUDE = {
  user: USER_SUMMARY,
  assessments: { orderBy: { assessmentDate: 'desc' as const }, take: 1 },
} as const;

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

    // New patients inherit the nutritionist's configured defaults for the two
    // patient-app toggles; the per-patient value can be changed afterwards via
    // updatePatient.
    const defaults = await this.prisma.nutritionistProfile.findUniqueOrThrow({
      where: { id: nutritionistId },
      select: { defaultCanLogAssessments: true, defaultShowMealTargetToPatient: true },
    });

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
        clinical: {
          ...clinical,
          canLogAssessments: defaults.defaultCanLogAssessments,
          showMealTargetToPatient: defaults.defaultShowMealTargetToPatient,
        },
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

    const [rawItems, total] = await this.prisma.$transaction([
      this.prisma.patientProfile.findMany({
        where,
        include: PATIENT_LIST_INCLUDE,
        orderBy: { user: { name: 'asc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.patientProfile.count({ where }),
    ]);

    // PatientSummary never carries consent data (only PatientDetail.
    // latestConsent does, via getPatient). PATIENT_LIST_INCLUDE already
    // doesn't fetch consents, but `consents` is also stripped here — as
    // defense in depth — in case a raw row ever carries one anyway. The cast
    // just widens the destructure target; it does not affect the real,
    // consents-less Prisma return type.
    const items = rawItems.map((raw) => {
      const { assessments, consents: _consents, ...rest } = raw as typeof raw & {
        consents?: unknown;
      };
      return { ...rest, imc: computeImc(rest.height, assessments[0]?.weight ?? null) };
    });

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getPatient(ctx: AuthContext, id: string) {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      include: PATIENT_DETAIL_INCLUDE,
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return this.toDetail(patient);
  }

  async updatePatient(ctx: AuthContext, id: string, dto: UpdatePatientDto) {
    await this.requireOwned(ctx, id);
    // Check-then-act is acceptable here: a nutritionist only ever touches their
    // own patients and patient re-assignment is out of MVP scope. update() must
    // target by primary key, so ownership can't be folded into this call.
    // Return the full PatientDetail shape (same include as getPatient) so the
    // PATCH response matches its declared type and clients can cache it without
    // losing the user/assessments relations.
    const patient = await this.prisma.patientProfile.update({
      where: { id },
      data: dto,
      include: PATIENT_DETAIL_INCLUDE,
    });
    return this.toDetail(patient);
  }

  async uploadPhoto(ctx: AuthContext, id: string, file: UploadedImage) {
    await this.requireOwned(ctx, id);
    if (!isSupportedImage(file.buffer)) throw new BadRequestException('Arquivo de imagem inválido.');
    const ext = EXT_BY_MIME[file.mimetype] ?? 'png';
    const photoUrl = await this.supabaseAdmin.uploadPublicObject(
      PHOTO_BUCKET,
      `${id}.${ext}`,
      file.buffer,
      file.mimetype,
    );
    const patient = await this.prisma.patientProfile.update({
      where: { id },
      data: { photoUrl },
      include: PATIENT_DETAIL_INCLUDE,
    });
    return this.toDetail(patient);
  }

  async removePhoto(ctx: AuthContext, id: string) {
    await this.requireOwned(ctx, id);
    const current = await this.prisma.patientProfile.findUnique({
      where: { id },
      select: { photoUrl: true },
    });
    if (current?.photoUrl) {
      const path = current.photoUrl.split('/').pop();
      if (path) await this.supabaseAdmin.removeObject(PHOTO_BUCKET, path);
    }
    const patient = await this.prisma.patientProfile.update({
      where: { id },
      data: { photoUrl: null },
      include: PATIENT_DETAIL_INCLUDE,
    });
    return this.toDetail(patient);
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

    // Read the photo path before teardown (the row is gone after the tx).
    const profile = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { photoUrl: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.outsideHomeRequest.deleteMany({ where: { patientId } });
      await tx.aIInteraction.deleteMany({ where: { patientId } });
      await tx.appointment.deleteMany({ where: { patientId } });
      await tx.bodyAssessment.deleteMany({ where: { patientId } });
      await tx.nutritionTarget.deleteMany({ where: { patientId } });
      await tx.silhuetaScan.deleteMany({ where: { patientId } });
      await tx.mealPlan.deleteMany({ where: { patientId } });
      await tx.patientProfile.delete({ where: { id: patientId } });
      await tx.user.delete({ where: { id: userId } });
    });

    await this.supabaseAdmin.deleteUser(authProviderId);

    // Best-effort: the account is already deleted; a failed object removal must
    // not surface as an error (an orphan file is acceptable).
    if (profile?.photoUrl) {
      const path = profile.photoUrl.split('/').pop();
      if (path) {
        try {
          await this.supabaseAdmin.removeObject(PHOTO_BUCKET, path);
        } catch {
          // ignore
        }
      }
    }
  }

  // Patient-facing (LGPD access): the caller exports THEIR OWN data as one JSON
  // object. Scope resolves to the caller's own patientProfile — never another's.
  async exportMyData(ctx: AuthContext) {
    const patientId = resolveScopePatientId(ctx);
    const p = await this.prisma.patientProfile.findUniqueOrThrow({
      where: { id: patientId },
      include: { user: { select: { name: true, email: true } } },
    });
    const [assessments, mealPlans, nutritionTargets, silhuetaScans, appointments, consents] =
      await Promise.all([
        this.prisma.bodyAssessment.findMany({ where: { patientId }, orderBy: { assessmentDate: 'asc' } }),
        this.prisma.mealPlan.findMany({
          where: { patientId },
          orderBy: { createdAt: 'asc' },
          include: {
            meals: {
              orderBy: { order: 'asc' },
              include: {
                options: { orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' } } } },
              },
            },
          },
        }),
        this.prisma.nutritionTarget.findMany({ where: { patientId }, orderBy: { targetDate: 'asc' } }),
        this.prisma.silhuetaScan.findMany({ where: { patientId }, orderBy: { scanDate: 'asc' } }),
        this.prisma.appointment.findMany({ where: { patientId }, orderBy: { startsAt: 'asc' } }),
        this.prisma.patientConsent.findMany({ where: { patientId }, orderBy: { acceptedAt: 'asc' } }),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        name: p.user.name,
        email: p.user.email,
        birthDate: p.birthDate,
        gender: p.gender,
        height: p.height,
        targetWeight: p.targetWeight,
        objective: p.objective,
        activityLevel: p.activityLevel,
        restrictions: p.restrictions,
        allergies: p.allergies,
        medicalConditions: p.medicalConditions,
        notes: p.notes,
        canLogAssessments: p.canLogAssessments,
        showMealTargetToPatient: p.showMealTargetToPatient,
        photoUrl: p.photoUrl,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
      assessments,
      mealPlans,
      nutritionTargets,
      silhuetaScans,
      appointments,
      consents,
    };
  }

  // Consolidates the PatientDetail shape shared by getPatient/updatePatient/
  // uploadPhoto/removePhoto: derives imc from height + latest assessment, and
  // surfaces the latest LGPD consent (or null) while stripping the raw
  // consents relation out of the response.
  private toDetail<
    T extends {
      height: number | null;
      assessments: { weight: number | null }[];
      consents: { policyVersion: string; acceptedAt: Date }[];
    },
  >(patient: T) {
    const { consents, ...rest } = patient;
    return {
      ...rest,
      imc: computeImc(patient.height, patient.assessments[0]?.weight ?? null),
      latestConsent: consents[0]
        ? { policyVersion: consents[0].policyVersion, acceptedAt: consents[0].acceptedAt }
        : null,
    };
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
