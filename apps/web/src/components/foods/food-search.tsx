'use client';

import { useState } from 'react';
import type { Food } from '@nutri-plus/shared-types';
import { useFoodSearch } from '@/lib/queries/foods';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { Input } from '@/components/ui/input';

type FoodSearchProps = {
  onSelect?: (food: Food) => void;
  placeholder?: string;
};

export function FoodSearch({ onSelect, placeholder = 'Buscar alimento' }: FoodSearchProps) {
  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term, 300);
  const query = useFoodSearch(debounced);
  const foods = query.data ?? [];
  const hasTerm = debounced.trim().length >= 2;

  return (
    <div className="space-y-2">
      <Input
        placeholder={placeholder}
        aria-label="Buscar alimento"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      {!hasTerm && (
        <p className="text-sm text-muted-foreground">Digite ao menos 2 letras para buscar.</p>
      )}

      {hasTerm && query.isLoading && <p className="text-sm text-muted-foreground">Buscando…</p>}

      {hasTerm && !query.isLoading && foods.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum alimento encontrado.</p>
      )}

      {hasTerm && foods.length > 0 && (
        <ul
          className={
            'divide-y overflow-hidden rounded-xl border bg-card' +
            (query.isFetching ? ' opacity-60 transition-opacity' : ' transition-opacity')
          }
        >
          {foods.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => onSelect?.(food)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted/40"
              >
                <span className="min-w-0 truncate">
                  {food.name}
                  {food.group ? ` · ${food.group}` : ''}
                </span>
                <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                  {food.energyKcal === null ? '—' : Math.round(food.energyKcal * 100) / 100} kcal/100g
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
