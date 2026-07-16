'use client';

import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { BodyAssessment } from '@nutri-plus/shared-types';
import { assessmentSchema, type AssessmentValues } from '@/lib/validation/assessment';
import {
  useCreateAssessment,
  useDeleteAssessment,
  useUpdateAssessment,
} from '@/lib/queries/assessments';
import { ApiError } from '@/lib/api/client';
import { kgFromPercent } from '@/lib/health/imc';
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type NumField = { name: keyof AssessmentValues; label: string };

const COMPOSITION: NumField[] = [
  { name: 'weight', label: 'Peso (kg)' },
  { name: 'bodyFatPercentage', label: '% Gordura' },
  { name: 'muscleMassPercentage', label: 'Massa muscular (%)' },
  { name: 'leanMassPercentage', label: 'Massa magra (%)' },
  { name: 'visceralFat', label: 'Gordura visceral' },
  { name: 'basalMetabolicRate', label: 'TMB (kcal)' },
  { name: 'bodyWaterPercentage', label: '% Água' },
  { name: 'boneMass', label: 'Massa óssea (kg)' },
  { name: 'metabolicAge', label: 'Idade metabólica' },
];

const CIRCUMFERENCES: NumField[] = [
  { name: 'waistCircumference', label: 'Cintura (cm)' },
  { name: 'abdomenCircumference', label: 'Abdômen (cm)' },
  { name: 'hipCircumference', label: 'Quadril (cm)' },
  { name: 'thighCircumference', label: 'Coxa medial (cm)' },
  { name: 'armCircumference', label: 'Braço relaxado (cm)' },
  { name: 'contractedArmCircumference', label: 'Braço contraído (cm)' },
  { name: 'chestCircumference', label: 'Busto (cm)' },
  { name: 'calfCircumference', label: 'Panturrilha (cm)' },
];

const NUM_NAMES = [...COMPOSITION, ...CIRCUMFERENCES].map((f) => f.name);

const PERCENT_FIELDS = new Set(['bodyFatPercentage', 'muscleMassPercentage', 'leanMassPercentage', 'bodyWaterPercentage']);

function defaults(assessment?: BodyAssessment): AssessmentValues {
  const str = (v: number | null | undefined) => (v == null ? '' : String(v));
  const base: Record<string, string> = {
    assessmentDate: assessment?.assessmentDate
      ? assessment.assessmentDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    notes: assessment?.notes ?? '',
  };
  for (const name of NUM_NAMES) {
    base[name] = str(assessment?.[name as keyof BodyAssessment] as number | null | undefined);
  }
  return base as unknown as AssessmentValues;
}

export function AssessmentDialog({
  open,
  onOpenChange,
  patientId,
  assessment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  assessment?: BodyAssessment;
}) {
  const create = useCreateAssessment(patientId);
  const update = useUpdateAssessment(patientId);
  const remove = useDeleteAssessment(patientId);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const form = useForm<AssessmentValues>({
    resolver: zodResolver(assessmentSchema) as Resolver<AssessmentValues>,
    defaultValues: defaults(assessment),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaults(assessment));
      setFormError(null);
      setConfirmingDelete(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assessment]);

  async function onSubmit(values: AssessmentValues) {
    setFormError(null);
    try {
      if (assessment) {
        await update.mutateAsync({ id: assessment.id, body: values });
        toast.success('Avaliação atualizada.');
      } else {
        await create.mutateAsync(values);
        toast.success('Avaliação registrada.');
      }
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? 'Não foi possível salvar a avaliação.'
          : 'Erro inesperado ao salvar a avaliação.';
      setFormError(message);
      toast.error(message);
    }
  }

  async function onDelete() {
    if (!assessment) return;
    try {
      await remove.mutateAsync(assessment.id);
      toast.success('Avaliação excluída.');
      onOpenChange(false);
    } catch {
      toast.error('Não foi possível excluir a avaliação.');
    }
  }

  const pending =
    form.formState.isSubmitting || create.isPending || update.isPending || remove.isPending;

  function renderNumber({ name, label }: NumField) {
    return (
      <FormField
        key={name}
        control={form.control}
        name={name}
        render={({ field }) => {
          const weightRaw = form.watch('weight') as unknown as string | number | undefined;
          const w = weightRaw === '' || weightRaw == null ? null : Number(weightRaw);
          const fieldValue = field.value as unknown as string | number | undefined;
          const p = fieldValue === '' || fieldValue == null ? null : Number(fieldValue);
          const kg =
            PERCENT_FIELDS.has(name as string) && w != null && !Number.isNaN(w) && p != null && !Number.isNaN(p)
              ? kgFromPercent(w, p)
              : null;
          return (
            <FormItem>
              <FormLabel>{label}</FormLabel>
              <FormControl>
                <Input type='number' inputMode='decimal' step='any' {...field} />
              </FormControl>
              {/* EXPERIMENTAL (spec §3): real value in kg for this percentage. */}
              {kg != null && (
                <p className='mt-1 text-right text-xs text-muted-foreground/70'>
                  ≈ {kg.toLocaleString('pt-BR')} kg
                </p>
              )}
              <FormMessage />
            </FormItem>
          );
        }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{assessment ? 'Editar avaliação' : 'Nova avaliação'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4' noValidate>
            <FormField
              control={form.control}
              name='assessmentDate'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data da avaliação</FormLabel>
                  <FormControl>
                    <Input type='date' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <p className='mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                Composição corporal
              </p>
              <div className='grid gap-3 sm:grid-cols-2'>{COMPOSITION.map(renderNumber)}</div>
            </div>

            <div>
              <p className='mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                Circunferências
              </p>
              <div className='grid gap-3 sm:grid-cols-2'>{CIRCUMFERENCES.map(renderNumber)}</div>
            </div>

            <FormField
              control={form.control}
              name='notes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {formError && <p className='text-sm text-destructive'>{formError}</p>}

            {confirmingDelete ? (
              <DialogFooter className='flex-col items-stretch gap-2 sm:flex-row sm:items-center'>
                <p className='mr-auto text-sm text-muted-foreground'>
                  Excluir esta avaliação? Esta ação não pode ser desfeita.
                </p>
                <Button
                  type='button'
                  variant='outline'
                  className='rounded-full'
                  onClick={() => setConfirmingDelete(false)}
                  disabled={remove.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type='button'
                  className='rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  onClick={onDelete}
                  disabled={remove.isPending}
                >
                  {remove.isPending ? 'Excluindo…' : 'Excluir'}
                </Button>
              </DialogFooter>
            ) : (
              <DialogFooter className='justify-end'>
                {assessment && (
                  <Button
                    type='button'
                    variant='outline'
                    className='mr-auto rounded-full text-destructive'
                    onClick={() => setConfirmingDelete(true)}
                    disabled={pending}
                  >
                    Excluir
                  </Button>
                )}
                <Button
                  type='button'
                  variant='outline'
                  className='rounded-full'
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type='submit' className='rounded-full' disabled={pending}>
                  {pending ? 'Salvando…' : 'Salvar'}
                </Button>
              </DialogFooter>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
