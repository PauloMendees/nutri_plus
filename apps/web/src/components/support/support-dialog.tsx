'use client';

import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  type SupportCategory,
} from '@nutri-plus/shared-types';
import { submitSupportRequest } from '@/lib/api/support';
import { ApiError } from '@/lib/api/client';
import { supportRequestSchema, type SupportFormValues } from '@/lib/validation/support';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function SupportDialog({
  open,
  onOpenChange,
  defaultEmail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail: string;
}) {
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<SupportFormValues>({
    resolver: zodResolver(supportRequestSchema) as unknown as Resolver<SupportFormValues>,
    defaultValues: {
      replyTo: defaultEmail,
      category: undefined as unknown as SupportCategory,
      description: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        replyTo: defaultEmail,
        category: undefined as unknown as SupportCategory,
        description: '',
      });
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultEmail]);

  async function onSubmit(values: SupportFormValues) {
    setFormError(null);
    try {
      await submitSupportRequest(values);
      toast.success('Pedido de suporte enviado. Responderemos em breve.');
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 503
          ? 'Suporte indisponível no momento. Tente mais tarde ou escreva para contato@inutri.life.'
          : 'Não foi possível enviar. Tente novamente.';
      setFormError(message);
      toast.error(message);
    }
  }

  const pending = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Suporte</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Conte o que aconteceu. Responderemos no e-mail informado.
          </p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="replyTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail para retorno</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo do problema" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SUPPORT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {SUPPORT_CATEGORY_LABELS[c]}
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
                    <Textarea
                      rows={5}
                      placeholder="Descreva o problema com o máximo de detalhes possível."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter className="justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" className="rounded-full" disabled={pending}>
                {pending ? 'Enviando…' : 'Enviar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
