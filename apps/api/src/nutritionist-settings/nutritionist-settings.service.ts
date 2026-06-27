import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { UpdateNutritionistSettingsDto } from './dto/update-nutritionist-settings.dto';

const SELECT = { displayName: true, logoUrl: true, mealPlanAiInstructions: true } as const;
const LOGO_BUCKET = 'nutritionist-logos';
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

// A multer file as we use it (avoids depending on @types/multer's globals).
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
}

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
      },
      select: SELECT,
    });
  }

  async uploadLogo(ctx: AuthContext, file: UploadedImage) {
    const id = resolveScopeNutritionistId(ctx);
    const ext = EXT_BY_MIME[file.mimetype] ?? 'png';
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
