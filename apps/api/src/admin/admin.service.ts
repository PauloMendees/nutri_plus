import { Injectable, NotFoundException } from '@nestjs/common';
import { preferredNutritionistName } from '@nutri-plus/shared-types';
import type {
  AdminNutritionistDetail,
  AdminNutritionistFilters,
  AdminNutritionistRow,
  AdminPatientRow,
  Paginated,
} from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { planLabelOf } from '../billing/plan-policy';
import { inviteStatusOf } from '../patients/invite-status';
import { renderPdf } from '../meal-plans/pdf/pdf-printer';
import { buildNutritionistsReportDoc } from './admin-report-doc';
import { authOnlyRows, filterNutritionists, paginate } from './admin-nutritionists';

const PATIENT_SELECT = {
  id: true, name: true, email: true, phone: true, userId: true, firstAppLoginAt: true, createdAt: true,
  nutritionist: { select: { displayName: true, user: { select: { name: true } } } },
} as const;

function toPatientRow(p: {
  id: string; name: string; email: string | null; phone: string | null; userId: string | null;
  firstAppLoginAt: Date | null; createdAt: Date;
  nutritionist: { displayName: string | null; user: { name: string } } | null;
}): AdminPatientRow {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    nutritionistName: p.nutritionist
      ? preferredNutritionistName(p.nutritionist.displayName, p.nutritionist.user.name)
      : '—',
    inviteStatus: inviteStatusOf(p.userId, p.firstAppLoginAt),
    createdAt: p.createdAt.toISOString(),
  };
}

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
    return filterNutritionists([...confirmed, ...authOnlyRows(authUsers, localAuthIds)], f);
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

  async nutritionistDetail(id: string): Promise<AdminNutritionistDetail> {
    const p = await this.prisma.nutritionistProfile.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true, createdAt: true } },
        subscription: true,
        _count: { select: { patients: { where: { isDemo: false } } } },
      },
    });
    if (!p) throw new NotFoundException('Nutricionista não encontrada.');
    const patients = await this.prisma.patientProfile.findMany({
      where: { nutritionistId: id, isDemo: false },
      orderBy: { createdAt: 'desc' },
      select: PATIENT_SELECT,
    });
    return {
      nutritionist: {
        id: p.id,
        name: p.user.name,
        email: p.user.email,
        phone: p.whatsappNumber,
        confirmed: true,
        patientCount: p._count.patients,
        plan: planLabelOf(p.subscription, new Date()),
        createdAt: p.user.createdAt.toISOString(),
      },
      patients: patients.map(toPatientRow),
    };
  }

  async listPatients(search: string | undefined, page: number, pageSize: number): Promise<Paginated<AdminPatientRow>> {
    const term = search?.trim();
    const where = {
      isDemo: false,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' as const } },
              { email: { contains: term, mode: 'insensitive' as const } },
              { phone: { contains: term } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.patientProfile.count({ where }),
      this.prisma.patientProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: PATIENT_SELECT,
      }),
    ]);
    return { items: rows.map(toPatientRow), total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
}
