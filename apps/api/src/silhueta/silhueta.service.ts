import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { OpenAIProvider } from '../ai/openai.provider';
import { AIInteractionType } from '../generated/prisma/client';
import { UploadedImage, isSupportedImage } from '../supabase/image-upload';
import { silhuetaResponseSchema, SilhuetaResponse } from './silhueta-response.schema';
import { SILHUETA_SYSTEM_PROMPT, buildSilhuetaUserPrompt } from '../ai/prompts/silhueta.prompt';
import { CreateSilhuetaScanDto } from './dto/create-silhueta-scan.dto';

const round1 = (n: number) => Math.round(n * 10) / 10;
const dataUrl = (f: UploadedImage) => `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;

// Photo-based body-composition ESTIMATE. Photos are converted to data URLs
// solely to pass to the AI provider for this one call — they are NEVER
// uploaded, written to disk, or persisted anywhere. Only the numeric
// SilhuetaScan produced by the estimate is stored.
@Injectable()
export class SilhuetaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: OpenAIProvider,
  ) {}

  // Confirms the patient exists AND is linked to this nutritionist. A non-owned
  // id looks identical to a missing one (404) so existence does not leak.
  private async requireOwned(ctx: AuthContext, patientId: string): Promise<void> {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
  }

  async create(
    ctx: AuthContext,
    patientId: string,
    dto: CreateSilhuetaScanDto,
    front: UploadedImage,
    side: UploadedImage,
    back?: UploadedImage,
  ) {
    await this.requireOwned(ctx, patientId);
    if (!dto.consent) {
      throw new ForbiddenException('Consent required');
    }
    if (
      !isSupportedImage(front.buffer) ||
      !isSupportedImage(side.buffer) ||
      (back && !isSupportedImage(back.buffer))
    ) {
      throw new BadRequestException('Arquivo de imagem inválido.');
    }

    // Front + side are required; the posterior (back) view is optional extra
    // context passed through to the model when the nutritionist provides it.
    const images = [dataUrl(front), dataUrl(side)];
    if (back) {
      images.push(dataUrl(back));
    }

    const est = await this.provider.generateStructured<SilhuetaResponse>({
      tier: 'smart',
      system: SILHUETA_SYSTEM_PROMPT,
      user: buildSilhuetaUserPrompt({
        heightCm: dto.heightCm ?? null,
        weightKg: dto.weightKg ?? null,
        waistInput: dto.waistInput ?? null,
        hipInput: dto.hipInput ?? null,
      }),
      schema: silhuetaResponseSchema,
      schemaName: 'silhueta',
      type: AIInteractionType.SILHUETA_SCAN,
      patientId,
      images,
    });

    const fatMass =
      dto.weightKg != null && est.bodyFatPercentage != null
        ? round1((dto.weightKg * est.bodyFatPercentage) / 100)
        : null;

    // Photos are intentionally NOT persisted — only the numeric estimate below.
    return this.prisma.silhuetaScan.create({
      data: {
        patientId,
        heightCm: dto.heightCm ?? null,
        weightKg: dto.weightKg ?? null,
        waistInput: dto.waistInput ?? null,
        hipInput: dto.hipInput ?? null,
        fatMass,
        consentAcceptedAt: new Date(),
        ...est,
      },
    });
  }

  async list(ctx: AuthContext, patientId: string) {
    await this.requireOwned(ctx, patientId);
    return this.prisma.silhuetaScan.findMany({
      where: { patientId },
      orderBy: { scanDate: 'desc' },
    });
  }

  async apply(ctx: AuthContext, patientId: string, scanId: string) {
    await this.requireOwned(ctx, patientId);
    const scan = await this.prisma.silhuetaScan.findFirst({
      where: { id: scanId, patientId },
    });
    if (!scan) {
      throw new NotFoundException('Scan not found');
    }
    return this.prisma.bodyAssessment.create({
      data: {
        patientId,
        assessmentDate: scan.scanDate,
        weight: scan.weightKg,
        bodyFatPercentage: scan.bodyFatPercentage,
        muscleMassPercentage: scan.muscleMassPercentage,
        leanMassPercentage: scan.leanMassPercentage,
        waistCircumference: scan.waistCircumference,
        hipCircumference: scan.hipCircumference,
        chestCircumference: scan.chestCircumference,
        armCircumference: scan.armCircumference,
        thighCircumference: scan.thighCircumference,
        abdomenCircumference: scan.abdomenCircumference,
        contractedArmCircumference: scan.contractedArmCircumference,
        calfCircumference: scan.calfCircumference,
        // Server-set only — this flag must never come from client input.
        estimatedFromPhoto: true,
      },
    });
  }
}
