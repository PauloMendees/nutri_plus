import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { MealPlansService } from './meal-plans.service';
import { buildMealPlanDocDefinition, PdfMealPlan } from './pdf/meal-plan-doc';
import { renderPdf } from './pdf/pdf-printer';

@Injectable()
export class MealPlanPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mealPlans: MealPlansService,
  ) {}

  async generate(ctx: AuthContext, id: string): Promise<Buffer> {
    const plan = await this.mealPlans.getPlan(ctx, id); // scoped read; 404 propagates

    const nutritionistId = resolveScopeNutritionistId(ctx);
    const branding = await this.prisma.nutritionistProfile.findUnique({
      where: { id: nutritionistId },
      select: { displayName: true, logoUrl: true },
    });

    const logoDataUrl = await this.fetchLogo(branding?.logoUrl ?? null);

    const doc = buildMealPlanDocDefinition(plan as unknown as PdfMealPlan, {
      displayName: branding?.displayName ?? null,
      logoDataUrl,
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
