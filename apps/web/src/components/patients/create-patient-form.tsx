'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createPatientSchema, type CreatePatientValues } from '@/lib/validation/patient';
import { useCreatePatient } from '@/lib/queries/patients';
import { ApiError } from '@/lib/api/client';
import { PatientClinicalFields } from '@/components/patients/patient-clinical-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

function mapCreateError(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) {
    return 'Já existe um usuário com este e-mail.';
  }
  return 'Não foi possível criar o paciente. Tente novamente.';
}

export function CreatePatientForm() {
  const router = useRouter();
  const create = useCreatePatient();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CreatePatientValues>({
    resolver: zodResolver(createPatientSchema) as Resolver<CreatePatientValues>,
    defaultValues: {
      name: '',
      email: '',
      birthDate: '',
      gender: '',
      height: '',
      targetWeight: '',
      objective: '',
      activityLevel: '',
      restrictions: '',
      allergies: '',
      medicalConditions: '',
      notes: '',
    } as unknown as CreatePatientValues,
  });

  async function onSubmit(values: CreatePatientValues) {
    setFormError(null);
    try {
      const created = await create.mutateAsync(values);
      router.push(`/patients/${created.id}?created=1`);
    } catch (err) {
      setFormError(mapCreateError(err));
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/patients" className="text-sm text-muted-foreground hover:underline">
        ‹ Voltar para pacientes
      </Link>
      <h1 className="mt-2 mb-5 font-heading text-2xl font-bold">Novo paciente</h1>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <section className="rounded-xl border bg-card p-5">
            <h3 className="mb-4 font-heading text-sm font-semibold text-[#0a5c45]">Dados do paciente</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome completo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="paciente@email.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              O paciente receberá um convite por e-mail para acessar a conta.
            </p>
          </section>

          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <PatientClinicalFields control={form.control as any} />

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" className="rounded-full" asChild>
              <Link href="/patients">Cancelar</Link>
            </Button>
            <Button type="submit" className="rounded-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Criando…' : 'Criar paciente'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
