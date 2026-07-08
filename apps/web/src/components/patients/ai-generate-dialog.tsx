'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useGenerateMealPlan } from '@/lib/queries/meal-plans';
import { missingFieldsFromError } from '@/lib/meal-plans/generate-error';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function AiGenerateDialog({
  open,
  onOpenChange,
  patientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
}) {
  const generate = useGenerateMealPlan(patientId);
  const router = useRouter();
  const [instructions, setInstructions] = useState('');
  const [missing, setMissing] = useState<string[] | null>(null);

  useEffect(() => {
    if (open) {
      setInstructions('');
      setMissing(null);
    }
  }, [open]);

  async function onGenerate() {
    setMissing(null);
    try {
      const trimmed = instructions.trim();
      const plan = await generate.mutateAsync(trimmed || undefined);
      onOpenChange(false);
      router.push(`/patients/${patientId}/planos/${plan.id}`);
    } catch (err) {
      const fields = missingFieldsFromError(err);
      if (fields) {
        setMissing(fields);
      } else {
        toast.error('Não foi possível gerar o plano. Tente novamente.');
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar plano com IA</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="ai-instructions" className="text-sm font-medium">
            Instruções personalizadas (opcional)
          </label>
          <Textarea
            id="ai-instructions"
            rows={4}
            maxLength={2000}
            placeholder="Ex.: apenas 4 refeições; incluir whey (~24g proteína) no pós-treino."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            As instruções padrão das suas Configurações também se aplicam. Alergias, restrições e as metas do dia são sempre respeitadas.
          </p>
        </div>

        {missing && (
          <div className="rounded-xl border border-destructive/40 bg-card p-3 text-sm">
            <p className="font-medium text-destructive">Complete o cadastro do paciente para gerar com IA.</p>
            <p className="mt-1 text-muted-foreground">Faltando: {missing.join(', ')}.</p>
          </div>
        )}

        <DialogFooter className="justify-end">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={generate.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-full shadow-sm shadow-primary/30"
            onClick={onGenerate}
            disabled={generate.isPending}
          >
            {generate.isPending ? 'Gerando…' : '✨ Gerar plano'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
