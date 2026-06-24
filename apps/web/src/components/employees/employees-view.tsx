'use client';

import { useMemo, useState } from 'react';
import type { Employee } from '@nutri-plus/shared-types';
import { useEmployees } from '@/lib/queries/employees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmployeeDialog } from '@/components/employees/employee-dialog';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase() || '?';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function EmployeesView() {
  const query = useEmployees();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);

  const employees = query.data ?? [];
  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (term ? employees.filter((e) => e.user.name.toLowerCase().includes(term)) : employees),
    [employees, term],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Funcionários</h1>
          {query.data && (
            <p className="mt-1 text-sm text-muted-foreground">
              {employees.length} {employees.length === 1 ? 'funcionário' : 'funcionários'}
            </p>
          )}
        </div>
        <Button className="rounded-full" onClick={() => setCreating(true)}>
          + Novo funcionário
        </Button>
      </div>

      {query.data && employees.length > 0 && (
        <Input
          placeholder="Buscar por nome"
          aria-label="Buscar por nome"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      )}

      {query.isLoading && (
        <div data-testid="employees-loading" className="space-y-2 rounded-xl border bg-card p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar os funcionários.{' '}
          <button
            onClick={() => query.refetch()}
            className="font-semibold text-primary hover:underline"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {query.data && employees.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="font-medium">Nenhum funcionário ainda</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Convide o primeiro membro da sua equipe para começar.
          </p>
          <Button className="rounded-full" onClick={() => setCreating(true)}>
            Convidar funcionário
          </Button>
        </div>
      )}

      {query.data && employees.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum funcionário encontrado.
        </div>
      )}

      {filtered.length > 0 && (
        <>
          {/* Mobile: stacked cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setEditing(e)}
                className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                  {initials(e.user.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.user.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">{e.user.email}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Funcionário</th>
                  <th className="px-4 py-3 font-semibold">E-mail</th>
                  <th className="px-4 py-3 font-semibold">Desde</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setEditing(e)}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3 font-semibold">
                        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                          {initials(e.user.name)}
                        </span>
                        {e.user.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.user.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <EmployeeDialog open={creating} onOpenChange={(o) => !o && setCreating(false)} />
      {editing && (
        <EmployeeDialog open onOpenChange={(o) => !o && setEditing(null)} employee={editing} />
      )}
    </div>
  );
}
