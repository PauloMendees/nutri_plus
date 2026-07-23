'use client';

import { useEffect } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { anamneseSchema, type AnamneseFormValues } from '@/lib/validation/anamnese';
import { useAnamnese, useUpsertAnamnese } from '@/lib/queries/anamnese';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

type FieldKey = keyof AnamneseFormValues;
const GROUPS: { title: string; fields: { key: FieldKey; label: string; num?: boolean }[] }[] = [
  { title: 'Clínico', fields: [
    { key: 'mainComplaint', label: 'Queixa principal' }, { key: 'medications', label: 'Medicamentos em uso' },
    { key: 'familyHistory', label: 'Histórico familiar' }, { key: 'supplements', label: 'Suplementos' } ] },
  { title: 'Hábitos de vida', fields: [
    { key: 'sleepHoursPerNight', label: 'Horas de sono/noite', num: true },
    { key: 'waterIntakeLiters', label: 'Água (L/dia)', num: true },
    { key: 'alcoholUse', label: 'Álcool' }, { key: 'smoking', label: 'Tabagismo' },
    { key: 'physicalActivity', label: 'Atividade física (detalhes)' } ] },
  { title: 'Digestivo', fields: [ { key: 'bowelHabit', label: 'Hábito intestinal' } ] },
  { title: 'Alimentar', fields: [
    { key: 'mealsPerDay', label: 'Refeições/dia', num: true },
    { key: 'eatingHabits', label: 'Hábitos alimentares' }, { key: 'foodPreferences', label: 'Preferências' } ] },
  { title: 'Geral', fields: [ { key: 'clinicalNotes', label: 'Observações clínicas' } ] },
];

const str = (v: number | string | null | undefined) => (v == null ? '' : String(v));

export function AnamneseSection({ patientId, canEdit }: { patientId: string; canEdit: boolean }) {
  const query = useAnamnese(patientId);
  const upsert = useUpsertAnamnese(patientId);
  const form = useForm<AnamneseFormValues>({
    resolver: zodResolver(anamneseSchema) as unknown as Resolver<AnamneseFormValues>,
  });

  useEffect(() => {
    if (query.data) {
      const d = query.data;
      form.reset(Object.fromEntries(
        GROUPS.flatMap((g) => g.fields).map((f) => [f.key, str(d[f.key as keyof typeof d] as never)]),
      ) as AnamneseFormValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  if (query.isLoading) return <Skeleton className="h-64 w-full max-w-4xl" />;

  async function onSubmit(values: AnamneseFormValues) {
    try {
      await upsert.mutateAsync(values);
      toast.success('Anamnese salva.');
    } catch {
      toast.error('Não foi possível salvar a anamnese.');
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto max-w-4xl space-y-4">
      <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0">
        {GROUPS.map((g) => (
          <div key={g.title} className="rounded-xl border bg-card p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.fields.map((f) => (
                <label key={f.key} className="text-sm">
                  <span className="mb-1 block text-muted-foreground">{f.label}</span>
                  {f.num ? (
                    <Input type="number" inputMode="decimal" step="any" {...form.register(f.key)} />
                  ) : (
                    <Textarea rows={2} {...form.register(f.key)} />
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" className="rounded-full" disabled={upsert.isPending}>
            {upsert.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      )}
    </form>
  );
}
