import type { AdminNutritionistFilters, AdminNutritionistRow, Paginated } from '@nutri-plus/shared-types';
import type { AuthUserSummary } from '../supabase/supabase-admin.service';

// Quem se cadastrou e não confirmou o e-mail existe só no Supabase Auth: o
// usuário local (User + NutritionistProfile) nasce no sync-user, depois da
// confirmação. Convidados (pacientes/funcionários) também não confirmam até
// aceitar o convite — o invited_at separa os dois casos.
export function unconfirmedRows(authUsers: AuthUserSummary[], localAuthIds: Set<string>): AdminNutritionistRow[] {
  return authUsers
    .filter((u) => !u.emailConfirmedAt && !u.invitedAt && !localAuthIds.has(u.id) && !!u.email)
    .map((u) => ({
      id: null,
      name: u.name?.trim() || (u.email as string),
      email: u.email as string,
      phone: u.phone,
      confirmed: false,
      patientCount: 0,
      plan: 'NONE' as const,
      createdAt: new Date(u.createdAt).toISOString(),
    }));
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Dia de São Paulo (YYYY-MM-DD) de um instante ISO; compara-se como texto.
function saoPauloDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function filterNutritionists(rows: AdminNutritionistRow[], f: AdminNutritionistFilters): AdminNutritionistRow[] {
  const term = f.search ? fold(f.search.trim()) : '';
  return rows
    .filter((r) => !term || fold(r.name).includes(term) || fold(r.email).includes(term))
    .filter((r) => !f.confirmed || r.confirmed === (f.confirmed === 'yes'))
    .filter((r) => !f.plan || r.plan === f.plan)
    .filter((r) => !f.createdFrom || saoPauloDay(r.createdAt) >= f.createdFrom)
    .filter((r) => !f.createdTo || saoPauloDay(r.createdAt) <= f.createdTo)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
    totalPages: Math.ceil(items.length / pageSize),
  };
}
