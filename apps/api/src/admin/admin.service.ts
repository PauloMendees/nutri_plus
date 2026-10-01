import { Injectable } from '@nestjs/common';
import type { AdminNutritionistFilters, AdminNutritionistRow, Paginated } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { planLabelOf } from '../billing/plan-policy';
import { renderPdf } from '../meal-plans/pdf/pdf-printer';
import { buildNutritionistsReportDoc } from './admin-report-doc';
import { filterNutritionists, paginate, unconfirmedRows } from './admin-nutritionists';

// Painel de administradores: somente leitura, dados de todas as nutricionistas.
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  async listNutritionists(
    f: AdminNutritionistFilters,
    page: number,
    pageSize: number,
  ): Promise<Paginated<AdminNutritionistRow>> {
    return paginate(await this.allNutritionists(f), page, pageSize);
  }

  // Todas as linhas que passam nos filtros, sem paginação (também usado pelo PDF).
  async allNutritionists(f: AdminNutritionistFilters): Promise<AdminNutritionistRow[]> {
    const [profiles, authUsers] = await Promise.all([
      this.prisma.nutritionistProfile.findMany({
        include: {
          user: { select: { name: true, email: true, authProviderId: true, createdAt: true } },
          subscription: true,
          _count: { select: { patients: { where: { isDemo: false } } } },
        },
      }),
      this.supabaseAdmin.listAllUsers(),
    ]);
    const now = new Date();
    const confirmed: AdminNutritionistRow[] = profiles.map((p) => ({
      id: p.id,
      name: p.user.name,
      email: p.user.email,
      phone: p.whatsappNumber,
      confirmed: true,
      patientCount: p._count.patients,
      plan: planLabelOf(p.subscription, now),
      createdAt: p.user.createdAt.toISOString(),
    }));
    const localAuthIds = new Set(profiles.map((p) => p.user.authProviderId));
    return filterNutritionists([...confirmed, ...unconfirmedRows(authUsers, localAuthIds)], f);
  }

  async nutritionistsReport(f: AdminNutritionistFilters): Promise<{ buffer: Buffer; fileName: string }> {
    const generatedAt = new Date();
    const rows = await this.allNutritionists(f);
    const buffer = await renderPdf(buildNutritionistsReportDoc({ rows, filters: f, generatedAt }));
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(generatedAt);
    return { buffer, fileName: `nutricionistas-${day}.pdf` };
  }
}
