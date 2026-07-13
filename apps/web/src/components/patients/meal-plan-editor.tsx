'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type Resolver,
  type UseFormRegister,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { MealPlan, MealPlanDraft } from '@nutri-plus/shared-types';
import { mealPlanSchema, type MealPlanFormValues } from '@/lib/validation/meal-plan';
import {
  useCreateMealPlan,
  useDeleteMealPlan,
  useMealPlan,
  useUpdateMealPlan,
} from '@/lib/queries/meal-plans';
import { ApiError } from '@/lib/api/client';
import { downloadMealPlanPdf } from '@/lib/api/meal-plans';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { AiAdjustDialog } from '@/components/patients/ai-adjust-dialog';

type ItemValues = { foodName: string; quantity: string; calories: string; protein: string; carbs: string; fats: string };
type OptionValues = { label: string; items: ItemValues[] };
type FormValues = {
  title: string;
  objective: string;
  targetCalories: string;
  targetProtein: string;
  targetCarbs: string;
  targetFats: string;
  meals: { name: string; timeLabel: string; instructions: string; options: OptionValues[] }[];
};

const blankItem = (): ItemValues => ({ foodName: '', quantity: '', calories: '', protein: '', carbs: '', fats: '' });
const blankOption = (): OptionValues => ({ label: '', items: [blankItem()] });
const blankMeal = () => ({ name: '', timeLabel: '', instructions: '', options: [blankOption()] });

function blankDefaults(): FormValues {
  return {
    title: '', objective: '', targetCalories: '', targetProtein: '', targetCarbs: '', targetFats: '',
    meals: [blankMeal()],
  };
}

const numToStr = (n: number | null) => (n == null ? '' : String(n));

function toDefaults(plan: MealPlan): FormValues {
  return {
    title: plan.title ?? '',
    objective: plan.objective ?? '',
    targetCalories: numToStr(plan.targetCalories),
    targetProtein: numToStr(plan.targetProtein),
    targetCarbs: numToStr(plan.targetCarbs),
    targetFats: numToStr(plan.targetFats),
    meals: plan.meals.map((m) => ({
      name: m.name ?? '',
      timeLabel: m.timeLabel ?? '',
      instructions: m.instructions ?? '',
      options: m.options.map((o) => ({
        label: o.label ?? '',
        items: o.items.map((it) => ({
          foodName: it.foodName ?? '',
          quantity: it.quantity ?? '',
          calories: numToStr(it.calories),
          protein: numToStr(it.protein),
          carbs: numToStr(it.carbs),
          fats: numToStr(it.fats),
        })),
      })),
    })),
  };
}

function draftToDefaults(d: MealPlanDraft): FormValues {
  return {
    title: d.title ?? '',
    objective: d.objective ?? '',
    targetCalories: numToStr(d.targetCalories ?? null),
    targetProtein: numToStr(d.targetProtein ?? null),
    targetCarbs: numToStr(d.targetCarbs ?? null),
    targetFats: numToStr(d.targetFats ?? null),
    meals: (d.meals ?? []).map((m) => ({
      name: m.name ?? '',
      timeLabel: m.timeLabel ?? '',
      instructions: m.instructions ?? '',
      options: (m.options ?? []).map((o) => ({
        label: o.label ?? '',
        items: (o.items ?? []).map((it) => ({
          foodName: it.foodName ?? '',
          quantity: it.quantity ?? '',
          calories: numToStr(it.calories ?? null),
          protein: numToStr(it.protein ?? null),
          carbs: numToStr(it.carbs ?? null),
          fats: numToStr(it.fats ?? null),
        })),
      })),
    })),
  };
}

const TARGETS = [
  { key: 'targetCalories', total: 'calories', label: 'Kcal' },
  { key: 'targetProtein', total: 'protein', label: 'Proteína' },
  { key: 'targetCarbs', total: 'carbs', label: 'Carbo' },
  { key: 'targetFats', total: 'fats', label: 'Gordura' },
] as const;

const ITEM_MACROS = [
  { key: 'calories', label: 'Kcal' },
  { key: 'protein', label: 'P' },
  { key: 'carbs', label: 'C' },
  { key: 'fats', label: 'G' },
] as const;

// Auto-grow single-line text fields: sized like the Inputs they replace, but the
// shadcn Textarea's `field-sizing-content` lets them grow vertically with content.
const GROW = 'min-h-8 resize-none py-1';
const GROW_SM = 'min-h-7 resize-none py-1';

function sum(values: string[]): number {
  return values.reduce((acc, v) => acc + (Number(v) || 0), 0);
}

export function MealPlanEditor({
  patientId,
  canEdit = true,
  planId,
}: {
  patientId: string;
  canEdit?: boolean;
  planId?: string;
}) {
  const isCreate = !planId;
  const query = useMealPlan(planId ?? '');
  const create = useCreateMealPlan(patientId);
  const update = useUpdateMealPlan(patientId);
  const remove = useDeleteMealPlan(patientId);
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(mealPlanSchema) as unknown as Resolver<FormValues>,
    defaultValues: blankDefaults(),
  });
  const meals = useFieldArray({ control: form.control, name: 'meals' });

  useEffect(() => {
    if (!isCreate && query.data) form.reset(toDefaults(query.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const watched = form.watch('meals');
  // Options are interchangeable alternatives — the day total counts only the first
  // (primary) option of each meal.
  function totalFor(macro: 'calories' | 'protein' | 'carbs' | 'fats'): number {
    return sum((watched ?? []).flatMap((m) => (m.options?.[0]?.items ?? []).map((it) => it[macro])));
  }

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      if (isCreate) {
        const created = await create.mutateAsync({ patientId, ...(values as unknown as MealPlanFormValues) });
        toast.success('Plano criado.');
        router.replace(`/patients/${patientId}/planos/${created.id}`);
      } else {
        await update.mutateAsync({ id: planId!, body: values as unknown as MealPlanFormValues });
        toast.success('Plano salvo.');
      }
    } catch (err) {
      setFormError(
        err instanceof ApiError ? 'Não foi possível salvar o plano.' : 'Erro inesperado ao salvar.',
      );
    }
  }

  async function onExport() {
    if (isCreate) return;
    setExporting(true);
    try {
      await downloadMealPlanPdf(planId!);
    } catch {
      toast.error('Não foi possível exportar o PDF.');
    } finally {
      setExporting(false);
    }
  }

  async function onDelete() {
    if (isCreate) return;
    try {
      await remove.mutateAsync(planId!);
      toast.success('Plano excluído.');
      router.push(`/patients/${patientId}`);
    } catch {
      toast.error('Não foi possível excluir o plano.');
    }
  }

  if (!isCreate && query.isLoading) {
    return <Skeleton className="h-64 w-full max-w-3xl" />;
  }
  if (!isCreate && (query.isError || !query.data)) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <BackToPatient patientId={patientId} />
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Plano não encontrado.
        </div>
      </div>
    );
  }

  const pending = form.formState.isSubmitting || create.isPending || update.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <BackToPatient patientId={patientId} />
        {!isCreate && (
          <div className="flex gap-2">
            {canEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setAdjusting(true)}
              >
                Solicitar ajustes à IA
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={onExport}
              disabled={exporting}
            >
              {exporting ? 'Exportando…' : 'Exportar PDF'}
            </Button>
          </div>
        )}
      </div>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0">
          {/* Header */}
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="mp-title">Título</label>
            <Textarea id="mp-title" rows={1} className={GROW} placeholder="Título do plano" {...form.register('title')} />
            <Textarea rows={1} className={GROW} placeholder="Objetivo" aria-label="Objetivo" {...form.register('objective')} />
          </div>

          {/* Metas (por dia) */}
          <div className="rounded-xl border bg-card p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metas (por dia)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TARGETS.map((t) => (
                <label key={t.key} className="text-xs">
                  <span className="mb-1 block text-muted-foreground">{t.label}</span>
                  <Input type="number" inputMode="decimal" step="any" {...form.register(t.key)} />
                </label>
              ))}
            </div>
          </div>

          {/* Totals bar (first option per meal) */}
          <div className="sticky top-0 z-10 flex flex-wrap gap-4 rounded-xl border bg-card p-3">
            {TARGETS.map((t) => {
              const total = totalFor(t.total);
              const target = Number(form.watch(t.key)) || 0;
              return (
                <div key={t.total} className="text-center">
                  <b data-testid={`total-${t.total}`} className="block text-sm">
                    {total}
                    {target > 0 && <span className="text-muted-foreground">/{target}</span>}
                  </b>
                  <span className="text-[10px] text-muted-foreground">{t.label}</span>
                </div>
              );
            })}
          </div>

          {/* Meal cards */}
          {meals.fields.map((mealField, mealIndex) => (
            <MealCard
              key={mealField.id}
              control={form.control}
              register={form.register}
              mealIndex={mealIndex}
              canEdit={canEdit}
              isFirst={mealIndex === 0}
              isLast={mealIndex === meals.fields.length - 1}
              onRemove={() => meals.remove(mealIndex)}
              onMoveUp={() => meals.swap(mealIndex, mealIndex - 1)}
              onMoveDown={() => meals.swap(mealIndex, mealIndex + 1)}
            />
          ))}

          {canEdit && (
            <Button type="button" variant="outline" className="rounded-full" onClick={() => meals.append(blankMeal())}>
              + Adicionar refeição
            </Button>
          )}
        </fieldset>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        {canEdit && (
          <div className="flex items-center gap-2 border-t pt-4">
            {!isCreate &&
              (confirmingDelete ? (
                <span className="mr-auto flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Excluir? Esta ação não pode ser desfeita.</span>
                  <Button type="button" variant="outline" className="rounded-full" onClick={() => setConfirmingDelete(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={onDelete}
                    disabled={remove.isPending}
                  >
                    Excluir
                  </Button>
                </span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto rounded-full text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Excluir
                </Button>
              ))}
            <Button type="submit" className="rounded-full" disabled={pending}>
              {pending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        )}
      </form>

      {!isCreate && (
        <AiAdjustDialog
          open={adjusting}
          onOpenChange={setAdjusting}
          planId={planId!}
          onApplied={(draft) => {
            form.reset(draftToDefaults(draft));
            toast.success('Plano ajustado — revise e salve.');
          }}
        />
      )}
    </div>
  );
}

function MealCard({
  control,
  register,
  mealIndex,
  canEdit,
  isFirst,
  isLast,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  mealIndex: number;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const options = useFieldArray({ control, name: `meals.${mealIndex}.options` as const });

  return (
    <div data-testid="meal-card" className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Textarea rows={1} className={`max-w-48 ${GROW}`} placeholder="Refeição" aria-label="Nome da refeição" {...register(`meals.${mealIndex}.name`)} />
        <Textarea rows={1} className={`max-w-28 ${GROW}`} placeholder="08:00" aria-label="Horário" {...register(`meals.${mealIndex}.timeLabel`)} />
        {canEdit && (
          <span className="ml-auto flex gap-1">
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onMoveUp} disabled={isFirst} aria-label="Mover refeição para cima">↑</Button>
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onMoveDown} disabled={isLast} aria-label="Mover refeição para baixo">↓</Button>
            <Button type="button" variant="outline" size="sm" className="rounded-full text-destructive" onClick={onRemove} aria-label="Remover refeição">✕</Button>
          </span>
        )}
      </div>

      <Textarea rows={1} placeholder="Instruções (opcional)" aria-label="Instruções" {...register(`meals.${mealIndex}.instructions`)} />

      <div className="mt-3 space-y-3">
        {options.fields.map((optionField, optionIndex) => (
          <OptionCard
            key={optionField.id}
            control={control}
            register={register}
            mealIndex={mealIndex}
            optionIndex={optionIndex}
            canEdit={canEdit}
            isFirst={optionIndex === 0}
            isLast={optionIndex === options.fields.length - 1}
            onRemove={() => options.remove(optionIndex)}
            onMoveUp={() => options.swap(optionIndex, optionIndex - 1)}
            onMoveDown={() => options.swap(optionIndex, optionIndex + 1)}
          />
        ))}
      </div>

      {canEdit && (
        <button type="button" className="mt-3 text-xs font-semibold text-primary" onClick={() => options.append(blankOption())} aria-label="Adicionar opção">
          + Adicionar opção
        </button>
      )}
    </div>
  );
}

function OptionCard({
  control,
  register,
  mealIndex,
  optionIndex,
  canEdit,
  isFirst,
  isLast,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  mealIndex: number;
  optionIndex: number;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const items = useFieldArray({ control, name: `meals.${mealIndex}.options.${optionIndex}.items` as const });
  const watchedItems = useWatch({ control, name: `meals.${mealIndex}.options.${optionIndex}.items` }) as ItemValues[] | undefined;
  const subtotal = (macro: 'calories' | 'protein' | 'carbs' | 'fats') =>
    sum((watchedItems ?? []).map((it) => it[macro]));

  return (
    <div data-testid="option-card" className="rounded-lg border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Textarea
          rows={1}
          className={`max-w-40 ${GROW_SM}`}
          placeholder={`Opção ${optionIndex + 1}`}
          aria-label="Rótulo da opção"
          {...register(`meals.${mealIndex}.options.${optionIndex}.label`)}
        />
        {canEdit && (
          <span className="ml-auto flex gap-1">
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onMoveUp} disabled={isFirst} aria-label="Mover opção para cima">↑</Button>
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onMoveDown} disabled={isLast} aria-label="Mover opção para baixo">↓</Button>
            <Button type="button" variant="outline" size="sm" className="rounded-full text-destructive" onClick={onRemove} aria-label="Remover opção">✕</Button>
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase text-muted-foreground">
              <th className="py-1">Alimento</th><th className="py-1">Qtd</th>
              <th className="py-1">Kcal</th><th className="py-1">P</th><th className="py-1">C</th><th className="py-1">G</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {items.fields.map((itemField, itemIndex) => (
              <tr key={itemField.id}>
                <td className="py-1 pr-1"><Textarea rows={1} className={GROW_SM} aria-label="Alimento" {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.foodName`)} /></td>
                <td className="py-1 pr-1"><Textarea rows={1} className={`w-20 ${GROW_SM}`} aria-label="Quantidade" {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.quantity`)} /></td>
                {ITEM_MACROS.map((m) => (
                  <td key={m.key} className="py-1 pr-1">
                    <Input className="h-7 w-16" type="number" inputMode="decimal" step="any" aria-label={m.label}
                      {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.${m.key}` as const)} />
                  </td>
                ))}
                {canEdit && (
                  <td className="py-1">
                    <span className="flex gap-1">
                      <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => items.swap(itemIndex, itemIndex - 1)} disabled={itemIndex === 0} aria-label="Mover item para cima">↑</Button>
                      <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => items.swap(itemIndex, itemIndex + 1)} disabled={itemIndex === items.fields.length - 1} aria-label="Mover item para baixo">↓</Button>
                      <Button type="button" variant="outline" size="sm" className="rounded-full text-destructive" onClick={() => items.remove(itemIndex)} aria-label="Remover item">✕</Button>
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span data-testid="option-subtotal-calories">{subtotal('calories')} kcal</span>
        <span data-testid="option-subtotal-protein">P {subtotal('protein')}</span>
        <span data-testid="option-subtotal-carbs">C {subtotal('carbs')}</span>
        <span data-testid="option-subtotal-fats">G {subtotal('fats')}</span>
      </div>

      {canEdit && (
        <button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={() => items.append(blankItem())}>
          + Adicionar item
        </button>
      )}
    </div>
  );
}

function BackToPatient({ patientId }: { patientId: string }) {
  return (
    <Link
      href={`/patients/${patientId}`}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      Voltar ao paciente
    </Link>
  );
}
