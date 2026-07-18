'use client';

import { useState } from 'react';
import { useFoodSearch } from '@/lib/queries/foods';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

function macro(value: number | null): string {
  return value === null ? '—' : String(value);
}

export function FoodsBrowse() {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const query = useFoodSearch(debounced);
  const foods = query.data ?? [];
  const hasTerm = debounced.trim().length >= 2;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold">Alimentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consulte a tabela TACO por nome ou grupo do alimento.
        </p>
      </div>

      <Input
        placeholder="Buscar alimento (mínimo 2 letras)"
        aria-label="Buscar alimento"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {!hasTerm && (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Digite ao menos 2 letras para buscar um alimento.
        </div>
      )}

      {hasTerm && query.isLoading && (
        <div data-testid="foods-loading" className="space-y-2 rounded-xl border bg-card p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {hasTerm && query.isError && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao buscar os alimentos.{' '}
          <button
            onClick={() => query.refetch()}
            className="font-semibold text-primary hover:underline"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {hasTerm && !query.isLoading && !query.isError && foods.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum alimento encontrado.
        </div>
      )}

      {foods.length > 0 && (
        <div
          className={
            'overflow-hidden rounded-xl border bg-card' +
            (query.isFetching ? ' opacity-60 transition-opacity' : ' transition-opacity')
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Alimento</th>
                  <th className="px-4 py-3 font-semibold">Grupo</th>
                  <th className="px-4 py-3 font-semibold">Energia (kcal/100g)</th>
                  <th className="px-4 py-3 font-semibold">Proteína (g/100g)</th>
                  <th className="px-4 py-3 font-semibold">Carboidrato (g/100g)</th>
                  <th className="px-4 py-3 font-semibold">Gordura (g/100g)</th>
                  <th className="px-4 py-3 font-semibold">Fibra (g/100g)</th>
                  <th className="px-4 py-3 font-semibold">Sódio (mg/100g)</th>
                </tr>
              </thead>
              <tbody>
                {foods.map((food) => (
                  <tr key={food.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-semibold">{food.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{food.group ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{macro(food.energyKcal)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{macro(food.protein)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{macro(food.carbohydrate)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{macro(food.lipid)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{macro(food.fiber)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{macro(food.sodium)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
