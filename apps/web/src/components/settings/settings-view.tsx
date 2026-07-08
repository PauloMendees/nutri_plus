'use client';

import { useEffect, useRef } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { NutritionistSettings } from '@nutri-plus/shared-types';
import { settingsSchema, type SettingsValues } from '@/lib/validation/settings';
import {
  useDeleteLogo,
  useNutritionistSettings,
  useUpdateNutritionistSettings,
  useUploadLogo,
} from '@/lib/queries/settings';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ThemeToggleSwitch } from '@/components/settings/theme-toggle-switch';

function defaults(s?: NutritionistSettings): SettingsValues {
  return {
    displayName: s?.displayName ?? '',
    mealPlanAiInstructions: s?.mealPlanAiInstructions ?? '',
  };
}

export function SettingsView() {
  const query = useNutritionistSettings();
  const update = useUpdateNutritionistSettings();
  const uploadLogo = useUploadLogo();
  const deleteLogo = useDeleteLogo();
  const fileRef = useRef<HTMLInputElement>(null);

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema) as Resolver<SettingsValues>,
    defaultValues: defaults(),
  });

  useEffect(() => {
    if (query.data) form.reset(defaults(query.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  async function onSubmit(values: SettingsValues) {
    try {
      await update.mutateAsync(values);
      toast.success('Configurações salvas.');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? 'Não foi possível salvar.' : 'Erro inesperado ao salvar.',
      );
    }
  }

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadLogo.mutateAsync(file);
      toast.success('Logo atualizada.');
    } catch {
      toast.error('Não foi possível enviar a logo (use PNG/JPG/WEBP até 2MB).');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onRemoveLogo() {
    try {
      await deleteLogo.mutateAsync();
      toast.success('Logo removida.');
    } catch {
      toast.error('Não foi possível remover a logo.');
    }
  }

  if (query.isLoading) {
    return (
      <div data-testid="settings-loading" className="mx-auto max-w-2xl">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Erro ao carregar as configurações.{' '}
        <button onClick={() => query.refetch()} className="font-semibold text-primary hover:underline">
          Tentar de novo
        </button>
      </div>
    );
  }

  const logoUrl = query.data?.logoUrl ?? null;
  const logoPending = uploadLogo.isPending || deleteLogo.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">Configurações</h1>

      {/* Section: Plano alimentar */}
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="font-heading text-base font-bold">Plano alimentar</h2>

        {/* Logo */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Logomarca</p>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl ? (
              <img src={logoUrl} alt="Logomarca" className="h-14 w-14 rounded-lg border object-contain" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                Sem logo
              </span>
            )}
            <div className="flex gap-2">
              <label className="cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium hover:bg-muted/40">
                {logoUrl ? 'Substituir' : 'Enviar'}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label="Logomarca"
                  onChange={onPickLogo}
                  disabled={logoPending}
                />
              </label>
              {logoUrl && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full text-destructive"
                  onClick={onRemoveLogo}
                  disabled={logoPending}
                >
                  Remover logo
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP, até 2MB. Aparecerá no PDF do plano.</p>
        </div>

        {/* Name + default AI instructions */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome de exibição</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Dra. Daniela Almeida" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="mealPlanAiInstructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instruções padrão da IA</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Diretrizes aplicadas a todos os planos gerados por IA (ex.: priorizar alimentos acessíveis, evitar ultraprocessados)."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" className="rounded-full" disabled={update.isPending}>
                {update.isPending ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </form>
        </Form>
      </section>

      {/* Section: Aparência */}
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-heading text-base font-bold">Aparência</h2>
        <ThemeToggleSwitch />
      </section>
    </div>
  );
}
