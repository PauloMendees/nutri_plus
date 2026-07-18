'use client';

import { useEffect, useRef } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ThemeToggleSwitch } from '@/components/settings/theme-toggle-switch';

function defaults(s?: NutritionistSettings): SettingsValues {
  return {
    displayName: s?.displayName ?? '',
    mealPlanAiInstructions: s?.mealPlanAiInstructions ?? '',
    defaultCanLogAssessments: s?.defaultCanLogAssessments ?? false,
    defaultShowMealTargetToPatient: s?.defaultShowMealTargetToPatient ?? false,
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

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <Tabs defaultValue="plano">
            <TabsList>
              <TabsTrigger value="plano">Plano alimentar</TabsTrigger>
              <TabsTrigger value="aparencia">Aparência</TabsTrigger>
              <TabsTrigger value="app">Aplicativo Paciente</TabsTrigger>
            </TabsList>

            <TabsContent value="plano">
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
              </section>
            </TabsContent>

            <TabsContent value="aparencia">
              <section className="space-y-3 rounded-xl border bg-card p-5">
                <h2 className="font-heading text-base font-bold">Aparência</h2>
                <ThemeToggleSwitch />
              </section>
            </TabsContent>

            <TabsContent value="app">
              <section className="space-y-4 rounded-xl border bg-card p-5">
                <h2 className="font-heading text-base font-bold">Aplicativo Paciente</h2>
                <p className="text-sm text-muted-foreground">
                  Estas são configurações padrão aplicadas a novos pacientes. Você pode alterá-las
                  individualmente na página de detalhes de cada paciente.
                </p>

                <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="text-sm font-medium">Permitir registrar bioimpedância</p>
                    <TooltipProvider>
                      <UiTooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground" aria-label="Sobre esta configuração">
                            <Info className="h-3.5 w-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Se ligado, novos pacientes poderão registrar a própria bioimpedância pelo app.
                        </TooltipContent>
                      </UiTooltip>
                    </TooltipProvider>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={form.watch('defaultCanLogAssessments') ? 'default' : 'outline'}
                    className="shrink-0 rounded-full"
                    aria-pressed={Boolean(form.watch('defaultCanLogAssessments'))}
                    onClick={() =>
                      form.setValue('defaultCanLogAssessments', !form.watch('defaultCanLogAssessments'), {
                        shouldDirty: true,
                      })
                    }
                  >
                    {form.watch('defaultCanLogAssessments') ? 'Ligado ✓' : 'Desligado'}
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="text-sm font-medium">Mostrar a meta nutricional no app</p>
                    <TooltipProvider>
                      <UiTooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground" aria-label="Sobre esta configuração">
                            <Info className="h-3.5 w-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Se ligado, novos pacientes verão a meta nutricional (calorias e macros) no app.
                        </TooltipContent>
                      </UiTooltip>
                    </TooltipProvider>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={form.watch('defaultShowMealTargetToPatient') ? 'default' : 'outline'}
                    className="shrink-0 rounded-full"
                    aria-pressed={Boolean(form.watch('defaultShowMealTargetToPatient'))}
                    onClick={() =>
                      form.setValue(
                        'defaultShowMealTargetToPatient',
                        !form.watch('defaultShowMealTargetToPatient'),
                        { shouldDirty: true },
                      )
                    }
                  >
                    {form.watch('defaultShowMealTargetToPatient') ? 'Ligado ✓' : 'Desligado'}
                  </Button>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" className="rounded-full" disabled={update.isPending}>
                    Salvar
                  </Button>
                </div>
              </section>
            </TabsContent>
          </Tabs>
        </form>
      </Form>
    </div>
  );
}
