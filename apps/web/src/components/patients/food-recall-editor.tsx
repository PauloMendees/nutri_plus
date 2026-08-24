'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type Path,
  type Resolver,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { Food, FoodRecall } from '@nutri-plus/shared-types';
import { macrosForPortion } from '@nutri-plus/shared-types';
import { foodRecallSchema, type FoodRecallFormValues } from '@/lib/validation/food-recall';
import { localDateInput } from '@/lib/format/local-date';
import { registerFixture } from '@/lib/onboarding/fixtures';
import { useTour } from '@/components/onboarding/tour-provider';
import {
  useCreateFoodRecall,
  useDeleteFoodRecall,
  useFoodRecall,
  useUpdateFoodRecall,
} from '@/lib/queries/food-recalls';
import { useNutritionTargets } from '@/lib/queries/nutrition-targets';
import { ApiError } from '@/lib/api/client';
import { FoodPickerDialog } from '@/components/patients/food-picker-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

type ItemValues = { foodName: string; foodId: string; quantity: string; grams: string; calories: string; protein: string; carbs: string; fats: string; fiber: string; sodium: string };
type MealValues = { name: string; timeLabel: string; items: ItemValues[] };
type FormValues = { recallDate: string; notes: string; meals: MealValues[] };

const blankItem = (): ItemValues => ({ foodName: '', foodId: '', quantity: '', grams: '', calories: '', protein: '', carbs: '', fats: '', fiber: '', sodium: '' });
const blankMeal = (): MealValues => ({ name: '', timeLabel: '', items: [blankItem()] });
const numToStr = (n: number | null) => (n == null ? '' : String(n));
const dateInput = (iso: string) => new Date(iso).toISOString().slice(0, 10);

// Máscara de horário: "1200" -> "12:00" (dois-pontos automático após 2 dígitos).
const formatTimeLabel = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

function blankDefaults(): FormValues {
  return { recallDate: localDateInput(), notes: '', meals: [blankMeal()] };
}

function toDefaults(r: FoodRecall): FormValues {
  return {
    recallDate: dateInput(r.recallDate),
    notes: r.notes ?? '',
    meals: r.meals.map((m) => ({
      name: m.name ?? '',
      timeLabel: m.timeLabel ?? '',
      items: m.items.map((it) => ({
        foodName: it.foodName ?? '',
        foodId: it.foodId ?? '',
        quantity: it.quantity ?? '',
        grams: numToStr(it.grams),
        calories: numToStr(it.calories),
        protein: numToStr(it.protein),
        carbs: numToStr(it.carbs),
        fats: numToStr(it.fats),
        fiber: numToStr(it.fiber),
        sodium: numToStr(it.sodium),
      })),
    })),
  };
}

const ITEM_MACROS = [
  { key: 'calories', label: 'Kcal' },
  { key: 'protein', label: 'P' },
  { key: 'carbs', label: 'C' },
  { key: 'fats', label: 'G' },
  { key: 'fiber', label: 'Fib' },
  { key: 'sodium', label: 'Na' },
] as const;
type MacroKey = (typeof ITEM_MACROS)[number]['key'];
const GROW_SM = 'min-h-7 resize-none py-1';

function sum(values: string[]): number {
  return values.reduce((acc, v) => acc + (Number(v) || 0), 0);
}

export function FoodRecallEditor({
  patientId,
  recallId,
  canEdit = true,
}: {
  patientId: string;
  recallId?: string;
  canEdit?: boolean;
}) {
  const isCreate = !recallId;
  const query = useFoodRecall(recallId ?? '');
  const create = useCreateFoodRecall(patientId);
  const update = useUpdateFoodRecall(patientId);
  const remove = useDeleteFoodRecall(patientId);
  const targets = useNutritionTargets(patientId);
  const latest = targets.data?.[0];
  const router = useRouter();
  const tour = useTour();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(foodRecallSchema) as unknown as Resolver<FormValues>,
    defaultValues: blankDefaults(),
  });
  const meals = useFieldArray({ control: form.control, name: 'meals' });

  useEffect(() => {
    if (!isCreate && query.data) form.reset(toDefaults(query.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  useEffect(() => {
    return registerFixture('food-recall', () => {
      form.reset({
        recallDate: localDateInput(),
        notes: 'Recordatório de demonstração',
        meals: [
          {
            name: 'Café da manhã',
            timeLabel: '08:00',
            items: [
              {
                foodName: 'Aveia',
                foodId: '',
                quantity: '40 g',
                grams: '40',
                calories: '',
                protein: '',
                carbs: '',
                fats: '',
                fiber: '',
                sodium: '',
              },
            ],
          },
        ],
      });
    });
  }, [form]);

  const watched = form.watch('meals');
  function totalFor(macro: MacroKey): number {
    return sum((watched ?? []).flatMap((m) => (m.items ?? []).map((it) => it[macro])));
  }
  const META: Partial<Record<MacroKey, number | undefined>> = {
    calories: latest?.targetCalories,
    protein: latest?.proteinGrams,
    carbs: latest?.carbGrams,
    fats: latest?.fatGrams,
  };

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      if (isCreate) {
        const created = await create.mutateAsync({
          patientId,
          ...(values as unknown as FoodRecallFormValues),
        });
        toast.success('Recordatório criado.');
        const consumed = await tour.notifyChapterActionSucceeded();
        if (!consumed) {
          router.replace(`/patients/${patientId}/recordatorios/${created.id}`);
        }
      } else {
        await update.mutateAsync({ id: recallId!, body: values as unknown as FoodRecallFormValues });
        toast.success('Recordatório salvo.');
        await tour.notifyChapterActionSucceeded();
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? 'Não foi possível salvar.' : 'Erro inesperado.');
    }
  }

  async function onDelete() {
    if (isCreate) return;
    try {
      await remove.mutateAsync(recallId!);
      toast.success('Recordatório excluído.');
      router.push(`/patients/${patientId}`);
    } catch {
      toast.error('Não foi possível excluir.');
    }
  }

  if (!isCreate && query.isLoading) return <Skeleton className="h-64 w-full max-w-4xl" />;

  const pending = form.formState.isSubmitting || create.isPending || update.isPending;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href={`/patients/${patientId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao paciente
      </Link>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Data do recordatório</span>
              <Input type="date" {...form.register('recallDate')} />
            </label>
            <label className="min-w-60 flex-1 text-sm">
              <span className="mb-1 block text-muted-foreground">Observações</span>
              <Textarea rows={1} className={GROW_SM} {...form.register('notes')} />
            </label>
          </div>

          {/* Totals bar (all items) vs the latest Meta */}
          <div className="sticky top-0 z-10 flex flex-wrap gap-4 rounded-xl border bg-card p-3">
            {ITEM_MACROS.map((m) => {
              const total = totalFor(m.key);
              const meta = META[m.key];
              return (
                <div key={m.key} className="text-center">
                  <b data-testid={`total-${m.key}`} className="block text-sm">
                    {total}
                    {meta != null ? <span className="text-muted-foreground">/{meta}</span> : null}
                  </b>
                  <span className="text-[10px] text-muted-foreground">{m.label}</span>
                </div>
              );
            })}
          </div>

          {meals.fields.map((mealField, mealIndex) => (
            <MealCard
              key={mealField.id}
              control={form.control}
              register={form.register}
              setValue={form.setValue}
              mealIndex={mealIndex}
              canEdit={canEdit}
              onRemove={() => meals.remove(mealIndex)}
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
          <div className="flex items-center justify-end gap-2 border-t pt-4">
            {!isCreate && (
              <Button type="button" variant="outline" className="mr-auto rounded-full text-destructive" onClick={onDelete} disabled={remove.isPending}>
                Excluir
              </Button>
            )}
            <Button
              type="submit"
              className="rounded-full"
              disabled={pending}
              data-tour="patients.recall.save"
            >
              {pending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}

function MealCard({
  control,
  register,
  setValue,
  mealIndex,
  canEdit,
  onRemove,
}: {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  mealIndex: number;
  canEdit: boolean;
  onRemove: () => void;
}) {
  const items = useFieldArray({ control, name: `meals.${mealIndex}.items` as const });
  const watchedItems = useWatch({ control, name: `meals.${mealIndex}.items` }) as ItemValues[] | undefined;
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const foodCache = useRef<Record<string, Food>>({});

  const setField = (itemIndex: number, field: string, value: string) =>
    setValue(`meals.${mealIndex}.items.${itemIndex}.${field}` as Path<FormValues>, value);

  function fillMacros(itemIndex: number, food: Food, grams: number) {
    const m = macrosForPortion(food, grams);
    setField(itemIndex, 'calories', String(m.calories));
    setField(itemIndex, 'protein', String(m.protein));
    setField(itemIndex, 'carbs', String(m.carbs));
    setField(itemIndex, 'fats', String(m.fats));
    setField(itemIndex, 'fiber', String(m.fiber));
    setField(itemIndex, 'sodium', String(m.sodium));
  }

  function onPickFood(itemIndex: number, food: Food) {
    foodCache.current[food.id] = food;
    setField(itemIndex, 'foodId', food.id);
    setField(itemIndex, 'foodName', food.name);
    const gramsStr = (watchedItems?.[itemIndex]?.grams ?? '').trim();
    const grams = Number(gramsStr) || 100;
    if (!gramsStr) setField(itemIndex, 'grams', '100');
    fillMacros(itemIndex, food, grams);
  }

  function onGramsChange(itemIndex: number, value: string) {
    setField(itemIndex, 'grams', value);
    const foodId = watchedItems?.[itemIndex]?.foodId;
    const food = foodId ? foodCache.current[foodId] : undefined;
    const grams = Number(value);
    if (food && grams > 0) fillMacros(itemIndex, food, grams);
  }

  const subtotal = (macro: MacroKey) => sum((watchedItems ?? []).map((it) => it[macro]));

  return (
    <div data-testid="recall-meal-card" className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Textarea rows={1} className={`max-w-48 ${GROW_SM}`} placeholder="Refeição" aria-label="Nome da refeição" {...register(`meals.${mealIndex}.name`)} />
        <Textarea
          rows={1}
          className={`max-w-28 ${GROW_SM}`}
          placeholder="08:00"
          aria-label="Horário"
          inputMode="numeric"
          {...register(`meals.${mealIndex}.timeLabel`)}
          onChange={(e) => {
            const formatted = formatTimeLabel(e.target.value);
            e.target.value = formatted;
            setValue(`meals.${mealIndex}.timeLabel` as Path<FormValues>, formatted, { shouldDirty: true });
          }}
        />
        {canEdit && (
          <Button type="button" variant="outline" size="sm" className="ml-auto rounded-full text-destructive" onClick={onRemove} aria-label="Remover refeição">✕</Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase text-muted-foreground">
              {canEdit && <th />}
              <th className="py-1">Alimento</th>
              <th className="py-1">Qtd</th>
              <th className="py-1">Gramas</th>
              {ITEM_MACROS.map((m) => (
                <th key={m.key} className="py-1">{m.label}</th>
              ))}
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {items.fields.map((itemField, itemIndex) => (
              <tr key={itemField.id}>
                {canEdit && (
                  <td className="py-1 pr-1 align-top">
                    <Button type="button" variant="outline" size="sm" className="rounded-full" aria-label="Buscar alimento" onClick={() => setPickerFor(itemIndex)}>🔍</Button>
                  </td>
                )}
                <td className="py-1 pr-1 align-top"><Textarea rows={1} className={`w-48 ${GROW_SM}`} aria-label="Alimento" {...register(`meals.${mealIndex}.items.${itemIndex}.foodName`)} /></td>
                <td className="py-1 pr-1 align-top"><Textarea rows={1} className={`w-24 ${GROW_SM}`} aria-label="Quantidade" {...register(`meals.${mealIndex}.items.${itemIndex}.quantity`)} /></td>
                <td className="py-1 pr-1 align-top">
                  <Input
                    className="h-7 w-16"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    aria-label="Gramas"
                    value={watchedItems?.[itemIndex]?.grams ?? ''}
                    onChange={(e) => onGramsChange(itemIndex, e.target.value)}
                  />
                </td>
                {ITEM_MACROS.map((m) => (
                  <td key={m.key} className="py-1 pr-1 align-top">
                    <Input className="h-7 w-16" type="number" inputMode="decimal" step="any" aria-label={m.label}
                      {...register(`meals.${mealIndex}.items.${itemIndex}.${m.key}` as const)} />
                  </td>
                ))}
                {canEdit && (
                  <td className="py-1 align-top">
                    <Button type="button" variant="outline" size="sm" className="rounded-full text-destructive" onClick={() => items.remove(itemIndex)} aria-label="Remover item">✕</Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {ITEM_MACROS.map((m) => (
          <span key={m.key} data-testid={`meal-subtotal-${m.key}`}>{m.label} {subtotal(m.key)}</span>
        ))}
      </div>
      {canEdit && (
        <button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={() => items.append(blankItem())}>
          + Adicionar item
        </button>
      )}
      <FoodPickerDialog
        open={pickerFor !== null}
        onOpenChange={(o) => { if (!o) setPickerFor(null); }}
        onPick={(food) => { if (pickerFor !== null) onPickFood(pickerFor, food); setPickerFor(null); }}
      />
    </div>
  );
}
