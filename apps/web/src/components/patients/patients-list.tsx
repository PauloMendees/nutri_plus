'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePatients } from '@/lib/queries/patients';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { ACTIVITY_LABELS, OBJECTIVE_LABELS } from '@/lib/patients/labels';
import { formatImc } from '@/lib/health/imc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PatientAvatar } from '@/components/patients/patient-avatar';

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function PatientsList({ canCreate = true }: { canCreate?: boolean }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  // A new search term restarts paging at the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const query = usePatients({ search: debouncedSearch, page, pageSize: PAGE_SIZE });
  const data = query.data;
  const items = data?.items ?? [];
  const hasSearch = search.trim().length > 0;
  const showSearch = !!data && (data.total > 0 || hasSearch);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Pacientes</h1>
          {data && (
            <p className="mt-1 text-sm text-muted-foreground">
              {data.total} {data.total === 1 ? 'paciente' : 'pacientes'}
            </p>
          )}
        </div>
        {canCreate && (
          <Button className="rounded-full" asChild>
            <Link href="/patients/new">+ Novo paciente</Link>
          </Button>
        )}
      </div>

      {showSearch && (
        <Input
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar paciente"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      )}

      {query.isLoading && (
        <div data-testid="patients-loading" className="space-y-2 rounded-xl border bg-card p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar os pacientes.{' '}
          <button onClick={() => query.refetch()} className="font-semibold text-primary hover:underline">
            Tentar de novo
          </button>
        </div>
      )}

      {data && data.total === 0 && !hasSearch && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="font-medium">Nenhum paciente ainda</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Cadastre seu primeiro paciente para começar a acompanhá-lo.
          </p>
          {canCreate && (
            <Button className="rounded-full" asChild>
              <Link href="/patients/new">Cadastrar primeiro paciente</Link>
            </Button>
          )}
        </div>
      )}

      {data && data.total === 0 && hasSearch && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum paciente encontrado.
        </div>
      )}

      {items.length > 0 && (
        <div className={query.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* Mobile: stacked cards */}
          <div className="space-y-3 md:hidden">
            {items.map((p) => (
              <Link
                key={p.id}
                href={`/patients/${p.id}`}
                className="flex items-center gap-3 rounded-xl border bg-card p-4"
              >
                <PatientAvatar name={p.user.name} photoUrl={p.photoUrl} className="size-11 text-sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.user.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">{p.user.email}</span>
                </span>
                {p.objective && <Badge variant="secondary">{OBJECTIVE_LABELS[p.objective]}</Badge>}
              </Link>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Paciente</th>
                  <th className="px-4 py-3 font-semibold">E-mail</th>
                  <th className="px-4 py-3 font-semibold">IMC</th>
                  <th className="px-4 py-3 font-semibold">Objetivo</th>
                  <th className="px-4 py-3 font-semibold">Atividade</th>
                  <th className="px-4 py-3 font-semibold">Desde</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/patients/${p.id}`} className="flex items-center gap-3 font-semibold">
                        <PatientAvatar name={p.user.name} photoUrl={p.photoUrl} className="size-10 text-sm" />
                        {p.user.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.user.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatImc(p.imc)}</td>
                    <td className="px-4 py-3">
                      {p.objective ? <Badge variant="secondary">{OBJECTIVE_LABELS[p.objective]}</Badge> : '—'}
                    </td>
                    <td className="px-4 py-3">{p.activityLevel ? ACTIVITY_LABELS[p.activityLevel] : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Anterior
          </Button>
          <span className="text-muted-foreground">
            Página {data.page} de {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= data.totalPages}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
