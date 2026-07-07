'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { TransactionCategory } from '@nutri-plus/shared-types';
import {
  transactionCategoryFormSchema,
  type TransactionCategoryFormValues,
} from '@/lib/validation/transaction-category';
import {
  useCreateTransactionCategory,
  useDeleteTransactionCategory,
  useUpdateTransactionCategory,
} from '@/lib/queries/transaction-categories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function defaults(category?: TransactionCategory): TransactionCategoryFormValues {
  return { name: category?.name ?? '', type: category?.type ?? 'EXPENSE' };
}

export function TransactionCategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: TransactionCategory;
}) {
  const create = useCreateTransactionCategory();
  const update = useUpdateTransactionCategory();
  const remove = useDeleteTransactionCategory();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<TransactionCategoryFormValues>({
    resolver: zodResolver(transactionCategoryFormSchema),
    defaultValues: defaults(category),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaults(category));
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  async function onSubmit(values: TransactionCategoryFormValues) {
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
    } catch {
      const message = 'Não foi possível salvar a categoria.';
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
                    <Input placeholder="Ex: Consultas" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="INCOME">Receita</SelectItem>
                      <SelectItem value="EXPENSE">Despesa</SelectItem>
                    </SelectContent>
                  </Select>
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
