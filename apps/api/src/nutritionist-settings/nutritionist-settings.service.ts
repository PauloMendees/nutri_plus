import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { EXT_BY_MIME, isSupportedImage, UploadedImage } from '../supabase/image-upload';
import { UpdateNutritionistSettingsDto } from './dto/update-nutritionist-settings.dto';

const SELECT = {
  displayName: true,
  logoUrl: true,
  mealPlanAiInstructions: true,
  defaultCanLogAssessments: true,
  defaultShowMealTargetToPatient: true,
} as const;
const LOGO_BUCKET = 'nutritionist-logos';

export type { UploadedImage } from '../supabase/image-upload';

@Injectable()
export class NutritionistSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  getSettings(ctx: AuthContext) {
    return this.prisma.nutritionistProfile.findUniqueOrThrow({
      where: { id: resolveScopeNutritionistId(ctx) },
      select: SELECT,
    });
  }

  updateSettings(ctx: AuthContext, dto: UpdateNutritionistSettingsDto) {
    return this.prisma.nutritionistProfile.update({
      where: { id: resolveScopeNutritionistId(ctx) },
      data: {
        displayName: dto.displayName,
        mealPlanAiInstructions: dto.mealPlanAiInstructions,
        defaultCanLogAssessments: dto.defaultCanLogAssessments,
        defaultShowMealTargetToPatient: dto.defaultShowMealTargetToPatient,
      },
      select: SELECT,
    });
  }

  async uploadLogo(ctx: AuthContext, file: UploadedImage) {
    const id = resolveScopeNutritionistId(ctx);
    const ext = EXT_BY_MIME[file.mimetype] ?? 'png';
    if (!isSupportedImage(file.buffer)) throw new BadRequestException('Arquivo de imagem inválido.');
    const logoUrl = await this.supabaseAdmin.uploadPublicObject(
      LOGO_BUCKET,
      `${id}.${ext}`,
      file.buffer,
      file.mimetype,
    );
    return this.prisma.nutritionistProfile.update({
      where: { id },
      data: { logoUrl },
      select: SELECT,
    });
  }

  async removeLogo(ctx: AuthContext) {
    const id = resolveScopeNutritionistId(ctx);
    const current = await this.prisma.nutritionistProfile.findUnique({
      where: { id },
      select: { logoUrl: true },
    });
    if (current?.logoUrl) {
      const path = current.logoUrl.split('/').pop();
      if (path) {
        await this.supabaseAdmin.removeObject(LOGO_BUCKET, path);
      }
    }
    return this.prisma.nutritionistProfile.update({
      where: { id },
      data: { logoUrl: null },
      select: SELECT,
    });
  }
}
