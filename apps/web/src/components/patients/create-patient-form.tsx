'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { createPatientSchema, type CreatePatientValues } from '@/lib/validation/patient';
import { useCreatePatient } from '@/lib/queries/patients';
import { ApiError } from '@/lib/api/client';
import { registerFixture } from '@/lib/onboarding/fixtures';
import { useTour } from '@/components/onboarding/tour-provider';
import { PatientClinicalFields } from '@/components/patients/patient-clinical-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

function apiMessage(body: unknown): string | null {
  if (typeof body === 'string' && body.trim()) return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const msg = (body as { message: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg) && typeof msg[0] === 'string') return msg[0];
  }
  return null;
}

function mapCreateError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return 'Já existe um usuário com este e-mail.';
    const fromApi = apiMessage(err.body);
    if (fromApi) return fromApi;
    if (err.status === 502) {
      return 'Não foi possível enviar o convite para este e-mail. Use um endereço que receba mensagens.';
    }
  }
  return 'Não foi possível criar o paciente. Tente novamente.';
}

export function CreatePatientForm() {
  const router = useRouter();
  const create = useCreatePatient();
  const tour = useTour();
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

  function fillDemoPatient() {
    form.reset({
      name: 'Maria Demonstração',
      email: `demo.web.${Date.now()}@example.com`,
      birthDate: '1990-05-12',
      gender: 'FEMALE',
      height: '165',
      targetWeight: '',
      objective: 'WEIGHT_LOSS',
      activityLevel: 'MODERATE',
      restrictions: '',
      allergies: '',
      medicalConditions: '',
      notes: '',
    } as unknown as CreatePatientValues);
  }

  useEffect(() => registerFixture('create-patient', fillDemoPatient), [form]);

  async function onSubmit(values: CreatePatientValues) {
    setFormError(null);
    const playCadastro = tour.isPlayCadastroSubmit();
    try {
      const created = await create.mutateAsync(playCadastro ? { ...values, demo: true } : values);
      if (playCadastro) {
        await tour.notifyChapterActionSucceeded({ demoPatientId: created.id });
        return;
      }
      router.push(`/patients/${created.id}?created=1`);
    } catch (err) {
      if (playCadastro && err instanceof ApiError && err.status === 402) {
        tour.exit();
      }
      const message = mapCreateError(err);
      setFormError(message);
      toast.error(message);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/patients"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para pacientes
      </Link>
      <h1 className="mt-2 mb-5 font-heading text-2xl font-bold">Novo paciente</h1>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
          data-tour="patients.create.form"
        >
          <section className="rounded-xl border bg-card p-5">
            <h3 className="mb-4 font-heading text-sm font-semibold text-secondary-foreground">Dados do paciente</h3>
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

          <div className="flex flex-wrap justify-end gap-3">
            {tour.isPlayCadastroSubmit() ? (
              <Button type="button" variant="secondary" className="rounded-full" onClick={fillDemoPatient}>
                Preencher com dados fictícios
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="rounded-full" asChild>
              <Link href="/patients">Cancelar</Link>
            </Button>
            <Button
              type="submit"
              className="rounded-full"
              disabled={form.formState.isSubmitting}
              data-tour="patients.create.submit"
            >
              {form.formState.isSubmitting ? 'Criando…' : 'Criar paciente'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
