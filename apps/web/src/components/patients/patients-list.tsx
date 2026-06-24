'use client';

import Link from 'next/link';
import { usePatients } from '@/lib/queries/patients';
import { ACTIVITY_LABELS, OBJECTIVE_LABELS } from '@/lib/patients/labels';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function PatientsList({ canCreate = true }: { canCreate?: boolean }) {
  const query = usePatients();

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Pacientes</h1>
          {query.data && (
            <p className="mt-1 text-sm text-muted-foreground">
              {query.data.length} {query.data.length === 1 ? 'paciente' : 'pacientes'}
            </p>
          )}
        </div>
        {canCreate && (
          <Button className="rounded-full" asChild>
            <Link href="/patients/new">+ Novo paciente</Link>
          </Button>
        )}
      </div>

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

      {query.data && query.data.length === 0 && (
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

      {query.data && query.data.length > 0 && (
        <>
        {/* Mobile: stacked cards */}
        <div className="space-y-3 md:hidden">
          {query.data.map((p) => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="flex items-center gap-3 rounded-xl border bg-card p-4"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                {initials(p.user.name)}
              </span>
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
                <th className="px-4 py-3 font-semibold">Objetivo</th>
                <th className="px-4 py-3 font-semibold">Atividade</th>
                <th className="px-4 py-3 font-semibold">Desde</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link href={`/patients/${p.id}`} className="flex items-center gap-3 font-semibold">
                      <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                        {initials(p.user.name)}
                      </span>
                      {p.user.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.user.email}</td>
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
        </>
      )}
    </div>
  );
}
