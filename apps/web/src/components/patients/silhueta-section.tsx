'use client';

import { useRef, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { SilhuetaScan } from '@nutri-plus/shared-types';
import { silhuetaSchema, type SilhuetaValues } from '@/lib/validation/silhueta';
import { useCreateSilhuetaScan } from '@/lib/queries/silhueta';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SilhuetaDisclaimers, SilhuetaReport } from '@/components/patients/silhueta-report';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

type NumField = { name: 'heightCm' | 'weightKg' | 'waistInput' | 'hipInput'; label: string };

const NUMBER_FIELDS: NumField[] = [
  { name: 'heightCm', label: 'Altura (cm)' },
  { name: 'weightKg', label: 'Peso (kg)' },
  { name: 'waistInput', label: 'Cintura (cm) — opcional' },
  { name: 'hipInput', label: 'Quadril (cm) — opcional' },
];

function defaults(): SilhuetaValues {
  return {
    scanDate: new Date().toISOString().slice(0, 10),
    heightCm: '' as unknown as number | undefined,
    weightKg: '' as unknown as number | undefined,
    waistInput: '' as unknown as number | undefined,
    hipInput: '' as unknown as number | undefined,
  };
}

export function SilhuetaSection({
  patientId,
  onCreated,
}: {
  patientId: string;
  onCreated?: (scan: SilhuetaScan) => void;
}) {
  const create = useCreateSilhuetaScan(patientId);
  const [front, setFront] = useState<File | null>(null);
  const [side, setSide] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [created, setCreated] = useState<SilhuetaScan | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const sideRef = useRef<HTMLInputElement>(null);

  const form = useForm<SilhuetaValues>({
    resolver: zodResolver(silhuetaSchema) as Resolver<SilhuetaValues>,
    defaultValues: defaults(),
  });

  const canSubmit = Boolean(front && side && consent);

  function onPickFront(e: React.ChangeEvent<HTMLInputElement>) {
    setFront(e.target.files?.[0] ?? null);
  }

  function onPickSide(e: React.ChangeEvent<HTMLInputElement>) {
    setSide(e.target.files?.[0] ?? null);
  }

  async function onSubmit(values: SilhuetaValues) {
    if (!front || !side || !consent) return;

    const formData = new FormData();
    formData.append('front', front);
    formData.append('side', side);
    if (values.heightCm != null) formData.append('heightCm', String(values.heightCm));
    if (values.weightKg != null) formData.append('weightKg', String(values.weightKg));
    if (values.waistInput != null) formData.append('waistInput', String(values.waistInput));
    if (values.hipInput != null) formData.append('hipInput', String(values.hipInput));
    formData.append('consent', String(consent));

    try {
      const scan = await create.mutateAsync(formData);
      toast.success('Estimativa gerada com sucesso.');
      setCreated(scan);
      onCreated?.(scan);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? 'Não foi possível gerar a estimativa. Verifique as fotos e tente novamente.'
          : 'Erro inesperado ao enviar as fotos.',
      );
    }
  }

  function onNewScan() {
    setCreated(null);
    setFront(null);
    setSide(null);
    setConsent(false);
    if (frontRef.current) frontRef.current.value = '';
    if (sideRef.current) sideRef.current.value = '';
    form.reset(defaults());
  }

  if (created) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-base font-bold">Silhueta</h2>
            <p className="text-sm font-medium text-primary">Estimativa gerada com sucesso.</p>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={onNewScan}>
            Novo scan
          </Button>
        </div>
        <SilhuetaReport patientId={patientId} scan={created} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-base font-bold">Silhueta</h2>
        <p className="text-sm text-muted-foreground">
          Gere uma estimativa de composição corporal a partir de duas fotos (frontal e lateral)
          usando inteligência artificial. É um recurso complementar de acompanhamento da evolução
          do paciente.
        </p>
      </div>

      <SilhuetaDisclaimers />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="scanDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data do scan</FormLabel>
                <FormControl>
                  <Input type="date" disabled {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {NUMBER_FIELDS.map(({ name, label }) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="decimal" step="any" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>

          {/* Photo uploads */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">Foto frontal</p>
              <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground hover:bg-muted/40">
                {front ? front.name : 'Selecionar foto frontal'}
                <input
                  ref={frontRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label="Foto frontal"
                  onChange={onPickFront}
                />
              </label>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Foto lateral</p>
              <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground hover:bg-muted/40">
                {side ? side.name : 'Selecionar foto lateral'}
                <input
                  ref={sideRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label="Foto lateral"
                  onChange={onPickSide}
                />
              </label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP.</p>

          {/* Consent */}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4 rounded border-input"
              aria-label="Consentimento para processamento das fotos por IA"
            />
            <span>
              Autorizo o envio das fotos para processamento por um provedor de IA (OpenAI) para
              gerar esta estimativa. As fotos são usadas apenas para o cálculo e{' '}
              <strong>não são armazenadas</strong>.
            </span>
          </label>

          <div className="flex justify-end">
            <Button type="submit" className="rounded-full" disabled={!canSubmit || create.isPending}>
              {create.isPending ? 'Enviando…' : 'Enviar para análise'}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}
