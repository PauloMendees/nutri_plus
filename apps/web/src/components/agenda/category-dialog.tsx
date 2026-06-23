'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import type { AppointmentCategory } from '@nutri-plus/shared-types';
import { categoryFormSchema, type CategoryFormValues } from '@/lib/validation/appointment-category';
import {
  useCreateAppointmentCategory,
  useDeleteAppointmentCategory,
  useUpdateAppointmentCategory,
} from '@/lib/queries/appointment-categories';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const CATEGORY_COLORS = [
  '#14BFA6',
  '#0A5C45',
  '#3B82F6',
  '#8B5CF6',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#6B7280',
];

function defaults(category?: AppointmentCategory): CategoryFormValues {
  return {
    name: category?.name ?? '',
    color: category?.color ?? null,
    isDefault: category?.isDefault ?? false,
  };
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: AppointmentCategory;
}) {
  const create = useCreateAppointmentCategory();
  const update = useUpdateAppointmentCategory();
  const remove = useDeleteAppointmentCategory();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: defaults(category),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaults(category));
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  async function onSubmit(values: CategoryFormValues) {
    setFormError(null);
    try {
      if (category) {
        await update.mutateAsync({ id: category.id, body: values });
        toast.success('Categoria atualizada.');
      } else {
        await create.mutateAsync(values);
        toast.success('Categoria criada.');
      }
      onOpenChange(false);
    } catch (err) {
      // No special-cased category error codes; ApiError vs unknown map to the
      // same friendly message (instanceof kept for consistency with the codebase).
      const message =
        err instanceof ApiError
          ? 'Não foi possível salvar a categoria.'
          : 'Erro inesperado ao salvar a categoria.';
      setFormError(message);
      toast.error(message);
    }
  }

  async function onDelete() {
    if (!category) return;
    try {
      await remove.mutateAsync(category.id);
      toast.success('Categoria excluída.');
      onOpenChange(false);
    } catch {
      toast.error('Não foi possível excluir a categoria.');
    }
  }

  const pending =
    form.formState.isSubmitting || create.isPending || update.isPending || remove.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Consulta" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cor</FormLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => field.onChange(null)}
                      aria-label="Sem cor"
                      aria-pressed={field.value === null}
                      className={cn(
                        'size-7 rounded-full border bg-background text-[10px] text-muted-foreground',
                        field.value === null && 'ring-2 ring-ring ring-offset-2',
                      )}
                    >
                      ✕
                    </button>
                    {CATEGORY_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => field.onChange(c)}
                        aria-label={c}
                        aria-pressed={field.value === c}
                        style={{ backgroundColor: c }}
                        className={cn(
                          'size-7 rounded-full border',
                          field.value === c && 'ring-2 ring-ring ring-offset-2',
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <FormItem>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      className="size-4 rounded border-input"
                    />
                    Marcar como padrão
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground" aria-label="O que é a categoria padrão?">
                            <Info className="size-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          A categoria padrão vem pré-selecionada ao criar um agendamento. Só uma
                          categoria pode ser padrão.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </label>
                  <FormMessage />
                </FormItem>
              )}
            />

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter className="justify-end">
              {category && (
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto rounded-full text-destructive"
                  onClick={onDelete}
                  disabled={remove.isPending}
                >
                  Excluir
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="rounded-full" disabled={pending}>
                {pending ? 'Salvando…' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
