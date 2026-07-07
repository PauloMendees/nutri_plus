'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { Transaction } from '@nutri-plus/shared-types';
import { transactionFormSchema, type TransactionFormValues } from '@/lib/validation/transaction';
import { parseBRLToCents } from '@/lib/format/currency';
import {
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from '@/lib/queries/transactions';
import { useTransactionCategories } from '@/lib/queries/transaction-categories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

const NO_CATEGORY = '__none__';

function toDateInput(iso?: string): string {
  return iso ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function centsToInput(cents?: number): string {
  return cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

function defaults(t?: Transaction): TransactionFormValues {
  return {
    type: t?.type ?? 'EXPENSE',
    amount: centsToInput(t?.amountCents),
    occurredOn: toDateInput(t?.occurredOn),
    categoryId: t?.categoryId ?? null,
    description: t?.description ?? '',
  };
}

export function TransactionDialog({
  open,
  onOpenChange,
  transaction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction;
}) {
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: defaults(transaction),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaults(transaction));
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction]);

  const type = form.watch('type');
  const categories = useTransactionCategories();
  // Only categories matching the selected type are selectable.
  const options = useMemo(
    () => (categories.data ?? []).filter((c) => c.type === type),
    [categories.data, type],
  );

  async function onSubmit(values: TransactionFormValues) {
    setFormError(null);
    const body = {
      type: values.type,
      amountCents: parseBRLToCents(values.amount),
      occurredOn: new Date(`${values.occurredOn}T12:00:00`).toISOString(),
      categoryId: values.categoryId ?? null,
      description: values.description?.trim() ? values.description.trim() : null,
    };
    try {
      if (transaction) {
        await update.mutateAsync({ id: transaction.id, body });
        toast.success('Transação atualizada.');
      } else {
        await create.mutateAsync(body);
        toast.success('Transação registrada.');
      }
      onOpenChange(false);
    } catch {
      const message = 'Não foi possível salvar a transação.';
      setFormError(message);
      toast.error(message);
    }
  }

  async function onDelete() {
    if (!transaction) return;
    try {
      await remove.mutateAsync(transaction.id);
      toast.success('Transação excluída.');
      onOpenChange(false);
    } catch {
      toast.error('Não foi possível excluir a transação.');
    }
  }

  const pending =
    form.formState.isSubmitting || create.isPending || update.isPending || remove.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{transaction ? 'Editar transação' : 'Nova transação'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      form.setValue('categoryId', null); // reset category when type changes
                    }}
                  >
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
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor (R$) *</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" placeholder="0,00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="occurredOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <Select
                    value={field.value ?? NO_CATEGORY}
                    onValueChange={(v) => field.onChange(v === NO_CATEGORY ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sem categoria" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                      {options.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Opcional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter className="justify-end">
              {transaction && (
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
