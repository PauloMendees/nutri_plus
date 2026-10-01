import type {
  AdminNutritionistDetail,
  AdminNutritionistFilters,
  AdminNutritionistRow,
  AdminPatientRow,
  Paginated,
} from '@nutri-plus/shared-types';
import { browserApiDownload, browserApiFetch } from '@/lib/api/browser';

export const ADMIN_PAGE_SIZE = 20;

export function adminQueryString(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

function filterParams(f: AdminNutritionistFilters) {
  return {
    search: f.search?.trim() || undefined,
    confirmed: f.confirmed,
    plan: f.plan,
    createdFrom: f.createdFrom,
    createdTo: f.createdTo,
  };
}

export function listAdminNutritionists(
  f: AdminNutritionistFilters,
  page: number,
  pageSize = ADMIN_PAGE_SIZE,
): Promise<Paginated<AdminNutritionistRow>> {
  return browserApiFetch(`/admin/nutritionists${adminQueryString({ ...filterParams(f), page, pageSize })}`);
}

// Todas as nutricionistas que passam nos filtros, num PDF (a API rejeita paginação nesta rota).
export async function downloadAdminNutritionistsReport(f: AdminNutritionistFilters): Promise<void> {
  const blob = await browserApiDownload(`/admin/nutritionists/report.pdf${adminQueryString(filterParams(f))}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Dia de São Paulo no nome, como o fileName do Content-Disposition da API (o
  // download via blob não o aproveita): relatórios de dias diferentes não se sobrescrevem.
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  a.download = `nutricionistas-${day}.pdf`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getAdminNutritionist(id: string): Promise<AdminNutritionistDetail> {
  return browserApiFetch(`/admin/nutritionists/${encodeURIComponent(id)}`);
}

export function listAdminPatients(search: string, page: number, pageSize = ADMIN_PAGE_SIZE): Promise<Paginated<AdminPatientRow>> {
  return browserApiFetch(`/admin/patients${adminQueryString({ search: search.trim() || undefined, page, pageSize })}`);
}
