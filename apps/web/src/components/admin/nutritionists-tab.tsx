'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ADMIN_PLAN_LABELS, type AdminNutritionistFilters, type AdminPlanLabel } from '@nutri-plus/shared-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadAdminNutritionistsReport } from '@/lib/api/admin';
import { formatAdminDate } from '@/lib/admin/labels';
import { adminNutritionistHref } from '@/lib/admin/panel-url';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useHorizontalOverflow } from '@/lib/hooks/use-horizontal-overflow';
import { useAdminNutritionists } from '@/lib/queries/admin';

const SELECT_CLASS =
  'h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';
const PINNED_CELL = 'sticky left-0 z-10 bg-card';
const PINNED_DIVIDER = 'shadow-[inset_-1px_0_0_var(--border)]';

type FilterKey = 'search' | 'confirmed' | 'plan' | 'createdFrom' | 'createdTo';

const isPlan = (v: string | null): v is AdminPlanLabel => !!v && v in ADMIN_PLAN_LABELS;

// Filtros e página moram na URL (?tab=nutricionistas&plan=PRO&page=2…): abrir
// um detalhe e voltar — pelo navegador ou pelo link — reabre a mesma lista.
export function NutritionistsTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search') ?? '';
  const rawConfirmed = searchParams.get('confirmed');
  const confirmed: '' | 'yes' | 'no' = rawConfirmed === 'yes' || rawConfirmed === 'no' ? rawConfirmed : '';
  const rawPlan = searchParams.get('plan');
  const plan: '' | AdminPlanLabel = isPlan(rawPlan) ? rawPlan : '';
  const createdFrom = searchParams.get('createdFrom') ?? '';
  const createdTo = searchParams.get('createdTo') ?? '';
  const page = Math.max(1, Math.floor(Number(searchParams.get('page'))) || 1);

  // O campo de busca tem estado próprio (digitação); a URL só recebe o valor
  // depois do debounce, para não reescrever o histórico a cada tecla.
  const [search, setSearch] = useState(urlSearch);
  const [downloading, setDownloading] = useState(false);
  const [tableBoxRef, tableOverflows] = useHorizontalOverflow<HTMLDivElement>();
  const debouncedSearch = useDebouncedValue(search, 300);

  // replace (não push): filtrar não cria entradas no histórico, então o "voltar"
  // do navegador no detalhe cai direto na lista filtrada.
  function updateUrl(changes: Partial<Record<FilterKey | 'page', string>>) {
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', 'nutricionistas');
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`/admin?${next.toString()}`, { scroll: false });
  }

  // Mudar qualquer filtro volta para a primeira página.
  function setFilter(key: FilterKey, value: string) {
    updateUrl({ [key]: value, page: '' });
  }

  function setPage(p: number) {
    updateUrl({ page: p > 1 ? String(p) : '' });
  }

  const openDetail = (id: string) => () => router.push(adminNutritionistHref(id, searchParams.toString()));

  useEffect(() => {
    const term = debouncedSearch.trim();
    if (term !== urlSearch) setFilter('search', term);
    // Só reage à busca digitada; a URL é a fonte dos demais filtros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const filters: AdminNutritionistFilters = {
    search: urlSearch || undefined,
    confirmed: confirmed || undefined,
    plan: plan || undefined,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
  };
  const query = useAdminNutritionists(filters, page);
  const data = query.data;

  async function download() {
    setDownloading(true);
    try {
      await downloadAdminNutritionistsReport(filters);
    } catch {
      toast.error('Não foi possível gerar o relatório.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Buscar</span>
          <Input
            aria-label="Buscar"
            placeholder="Nome ou e-mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Confirmou</span>
          <select aria-label="Confirmou" className={SELECT_CLASS} value={confirmed} onChange={(e) => setFilter('confirmed', e.target.value)}>
            <option value="">Todos</option>
            <option value="yes">Sim</option>
            <option value="no">Não</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Plano</span>
          <select aria-label="Plano" className={SELECT_CLASS} value={plan} onChange={(e) => setFilter('plan', e.target.value)}>
            <option value="">Todos</option>
            {(Object.keys(ADMIN_PLAN_LABELS) as AdminPlanLabel[]).map((k) => (
              <option key={k} value={k}>
                {ADMIN_PLAN_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Cadastro de</span>
          <Input aria-label="Cadastro de" type="date" value={createdFrom} onChange={(e) => setFilter('createdFrom', e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">até</span>
          <Input aria-label="Cadastro até" type="date" value={createdTo} onChange={(e) => setFilter('createdTo', e.target.value)} />
        </label>
        <Button type="button" variant="outline" className="ml-auto rounded-full" onClick={download} disabled={downloading}>
          {downloading ? 'Gerando…' : 'Baixar relatório (PDF)'}
        </Button>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Não foi possível carregar as nutricionistas.
        </p>
      ) : data ? (
        <>
          <p className="text-sm text-muted-foreground">
            {data.total} {data.total === 1 ? 'nutricionista' : 'nutricionistas'}
          </p>
          <div ref={tableBoxRef} className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className={`${PINNED_CELL} ${tableOverflows ? PINNED_DIVIDER : ''} px-4 py-3 font-semibold`}>Nome</th>
                  <th className="px-4 py-3 font-semibold">E-mail</th>
                  <th className="px-4 py-3 font-semibold">Telefone</th>
                  <th className="px-4 py-3 font-semibold">Confirmou</th>
                  <th className="px-4 py-3 font-semibold">Pacientes</th>
                  <th className="px-4 py-3 font-semibold">Plano</th>
                  <th className="px-4 py-3 font-semibold">Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhuma nutricionista encontrada.
                    </td>
                  </tr>
                ) : (
                  data.items.map((n) => (
                    <tr
                      key={n.id ?? n.email}
                      // Quem existe só no Supabase Auth não tem perfil (nem pacientes): sem detalhe.
                      onClick={n.id ? openDetail(n.id) : undefined}
                      className={`group border-b last:border-0 ${n.id ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                    >
                      <td className={`${PINNED_CELL} ${tableOverflows ? PINNED_DIVIDER : ''} px-4 py-3 font-semibold ${n.id ? 'group-hover:bg-[color-mix(in_oklab,var(--card),var(--muted)_40%)]' : ''}`}>
                        <span className="block max-w-[14rem] truncate" title={n.name}>{n.name}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="block max-w-[16rem] truncate" title={n.email}>{n.email}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{n.phone ?? '—'}</td>
                      <td className="px-4 py-3">{n.confirmed ? 'Sim' : 'Não'}</td>
                      <td className="px-4 py-3">{n.patientCount}</td>
                      <td className="px-4 py-3">{ADMIN_PLAN_LABELS[n.plan]}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatAdminDate(n.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                Anterior
              </Button>
              <span className="text-muted-foreground">Página {data.page} de {data.totalPages}</span>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setPage(page + 1)} disabled={page >= data.totalPages}>
                Próxima
              </Button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
