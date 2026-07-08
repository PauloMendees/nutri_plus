import { BadRequestException, Injectable } from '@nestjs/common';
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

function isSupportedImage(buf: Buffer): boolean {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // WEBP: 'RIFF' .... 'WEBP'
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return true;
  return false;
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
