'use client';

import { useState } from 'react';
import type { TransactionCategory } from '@nutri-plus/shared-types';
import { useTransactionCategories } from '@/lib/queries/transaction-categories';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TransactionCategoryDialog } from '@/components/accounting/transaction-category-dialog';

export function TransactionCategoriesView() {
  const query = useTransactionCategories();
  const [editing, setEditing] = useState<TransactionCategory | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="font-heading text-2xl font-bold">Categorias</h1>
        <div className="flex-1" />
        <Button className="rounded-full" onClick={() => setCreating(true)}>
          Nova categoria
        </Button>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : query.isError ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Erro ao carregar as categorias.{' '}
          <button
            type="button"
            className="font-semibold text-primary underline"
            onClick={() => query.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      ) : (query.data ?? []).length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma categoria ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {(query.data ?? []).map((category) => (
            <button
              type="button"
              key={category.id}
              onClick={() => setEditing(category)}
              className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left duration-200 hover:opacity-70"
            >
              <span className="text-sm font-semibold">{category.name}</span>
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  category.type === 'INCOME'
                    ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                }`}
              >
                {category.type === 'INCOME' ? 'Receita' : 'Despesa'}
              </span>
            </button>
          ))}
        </div>
      )}

      <TransactionCategoryDialog open={creating} onOpenChange={(o) => !o && setCreating(false)} />
      {editing && (
        <TransactionCategoryDialog open onOpenChange={(o) => !o && setEditing(null)} category={editing} />
      )}
    </div>
  );
}
