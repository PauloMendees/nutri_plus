"use client";

import { useState } from "react";
import type { AppointmentCategory } from "@nutri-plus/shared-types";
import { useAppointmentCategories } from "@/lib/queries/appointment-categories";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryDialog } from "@/components/agenda/category-dialog";

export function CategoriesView() {
  const query = useAppointmentCategories();
  const [editing, setEditing] = useState<AppointmentCategory | null>(null);
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
          Erro ao carregar as categorias.{" "}
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
              className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left hover:opacity-70 duration-200"
            >
              <span
                className="size-4 shrink-0 rounded-full border"
                style={
                  category.color
                    ? { backgroundColor: category.color }
                    : undefined
                }
              />
              <span className="text-sm font-semibold">{category.name}</span>
              {category.isDefault && (
                <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-secondary-foreground">
                  Padrão
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <CategoryDialog
        open={creating}
        onOpenChange={(o) => !o && setCreating(false)}
      />
      {editing && (
        <CategoryDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          category={editing}
        />
      )}
    </div>
  );
}
