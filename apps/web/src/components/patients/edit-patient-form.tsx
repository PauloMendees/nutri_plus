'use client';

import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { PatientDetail } from '@nutri-plus/shared-types';
import { updatePatientSchema, type UpdatePatientValues } from '@/lib/validation/patient';
import { useUpdatePatient } from '@/lib/queries/patients';
import { PatientClinicalFields } from '@/components/patients/patient-clinical-fields';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';

function toDefaults(p: PatientDetail): UpdatePatientValues {
  return {
    birthDate: p.birthDate ? p.birthDate.slice(0, 10) : '',
    gender: p.gender ?? '',
    height: p.height ?? '',
    targetWeight: p.targetWeight ?? '',
    objective: p.objective ?? '',
    activityLevel: p.activityLevel ?? '',
    restrictions: p.restrictions ?? '',
    allergies: p.allergies ?? '',
    medicalConditions: p.medicalConditions ?? '',
    notes: p.notes ?? '',
  } as unknown as UpdatePatientValues;
}

export function EditPatientForm({
  patient,
  canEdit = true,
}: {
  patient: PatientDetail;
  canEdit?: boolean;
}) {
  const update = useUpdatePatient(patient.id);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<UpdatePatientValues>({
    resolver: zodResolver(updatePatientSchema) as Resolver<UpdatePatientValues>,
    defaultValues: toDefaults(patient),
  });

  async function onSubmit(values: UpdatePatientValues) {
    setFormError(null);
    try {
      await update.mutateAsync(values);
      toast.success('Perfil atualizado.');
    } catch {
      setFormError('Não foi possível salvar. Tente novamente.');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* A disabled fieldset natively disables every nested control (inputs,
            selects, textareas) — the read-only view for employees. */}
        <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <PatientClinicalFields control={form.control as any} />
        </fieldset>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" className="rounded-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
