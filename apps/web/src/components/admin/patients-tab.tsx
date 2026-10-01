'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useAdminPatients } from '@/lib/queries/admin';
import { AdminPatientsTable } from './nutritionist-detail';

// Todos os pacientes (reais) de todas as nutricionistas. Sem dados clínicos.
export function PatientsTab() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search, 300);
  const query = useAdminPatients(debounced.trim(), page);
  const data = query.data;

  return (
    <div className="space-y-4">
      <label className="block max-w-sm space-y-1 text-sm">
        <span className="block text-muted-foreground">Buscar</span>
        <Input
          aria-label="Buscar"
          placeholder="Nome, e-mail ou telefone"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </label>
      {query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Não foi possível carregar os pacientes.</p>
      ) : data ? (
        <>
          <p className="text-sm text-muted-foreground">
            {data.total} {data.total === 1 ? 'paciente' : 'pacientes'}
          </p>
          <AdminPatientsTable patients={data.items} showNutritionist />
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Anterior
              </Button>
              <span className="text-muted-foreground">Página {data.page} de {data.totalPages}</span>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setPage((p) => p + 1)} disabled={page >= data.totalPages}>
                Próxima
              </Button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
