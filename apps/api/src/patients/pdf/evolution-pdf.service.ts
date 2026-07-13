import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthContext } from '../../auth/types/auth-context';
import { resolveScopeNutritionistId, resolveScopePatientId } from '../../auth/auth-scope';
import { PatientsService } from '../patients.service';
import { renderPdf } from '../../meal-plans/pdf/pdf-printer';
import { buildEvolutionDocDefinition, EvolutionAssessment } from './evolution-doc';

interface EvolutionData {
  patientName: string;
  height: number | null;
  assessments: EvolutionAssessment[];
}

@Injectable()
export class EvolutionPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
  ) {}

  // Nutritionist/employee: branding from the caller's own nutritionist scope.
  async generate(ctx: AuthContext, patientId: string): Promise<Buffer> {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const assessments = await this.patients.listAssessments(ctx, patientId); // owned check; 404 propagates
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId },
      select: { height: true, user: { select: { name: true } } },
    });
    return this.build(
      {
        patientName: patient?.user.name ?? 'Paciente',
        height: patient?.height ?? null,
        assessments,
      },
      nutritionistId,
    );
  }

  // Patient: own evolution; branding from the patient's own nutritionist.
  async generateForPatient(ctx: AuthContext): Promise<Buffer> {
    const patientId = resolveScopePatientId(ctx);
    const { name, height, assessments } = await this.patients.listMyAssessments(ctx);
    const owner = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { nutritionistId: true },
    });
    return this.build({ patientName: name, height, assessments }, owner?.nutritionistId ?? null);
  }

  private async build(data: EvolutionData, nutritionistId: string | null): Promise<Buffer> {
    const branding = nutritionistId
      ? await this.prisma.nutritionistProfile.findUnique({
          where: { id: nutritionistId },
          select: { displayName: true, logoUrl: true },
        })
      : null;
    const logoDataUrl = await this.fetchLogo(branding?.logoUrl ?? null);
    const doc = buildEvolutionDocDefinition({
      patientName: data.patientName,
      height: data.height,
      assessments: data.assessments,
      branding: { displayName: branding?.displayName ?? null, logoDataUrl },
    });
    return renderPdf(doc);
  }

  // Best-effort: a missing/unfetchable logo yields a PDF without the logo.
  private async fetchLogo(logoUrl: string | null): Promise<string | null> {
    if (!logoUrl) return null;
    try {
      const res = await fetch(logoUrl);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? 'image/png';
      return `data:${contentType};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  }
}
