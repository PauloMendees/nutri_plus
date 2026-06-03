import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';

const USER_SUMMARY = { select: { id: true, name: true, email: true } } as const;

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPatients(ctx: AuthContext) {
    return this.prisma.patientProfile.findMany({
      where: { nutritionistId: this.nutritionistId(ctx) },
      include: { user: USER_SUMMARY },
    });
  }

  async getPatient(ctx: AuthContext, id: string) {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id, nutritionistId: this.nutritionistId(ctx) },
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
    return this.prisma.patientProfile.update({ where: { id }, data: dto });
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
      where: { patientId: id },
      orderBy: { assessmentDate: 'desc' },
    });
  }

  // The authenticated nutritionist's profile id. RolesGuard already guarantees a
  // NUTRITIONIST-role synced user; this defends against the impossible-but-not-
  // crashable case of a nutritionist with no profile row.
  private nutritionistId(ctx: AuthContext): string {
    const id = ctx.user?.nutritionistProfile?.id;
    if (!id) {
      throw new ForbiddenException('Nutritionist profile required');
    }
    return id;
  }

  // Confirms the patient exists AND is linked to this nutritionist. A non-owned
  // id looks identical to a missing one (404) so existence does not leak.
  private async requireOwned(ctx: AuthContext, id: string): Promise<void> {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id, nutritionistId: this.nutritionistId(ctx) },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
  }
}
