'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import { useGenerateMealPlan } from '@/lib/queries/meal-plans';
import { registerFixture } from '@/lib/onboarding/fixtures';
import { useTour } from '@/components/onboarding/tour-provider';
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
  const tour = useTour();
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    if (open) {
      setInstructions('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return registerFixture('ai-instructions', () => {
      setInstructions('Gerar um plano simples de demonstração, 3 refeições.');
    });
  }, [open]);

  async function onGenerate() {
    try {
      const trimmed = instructions.trim();
      await generate.mutateAsync(trimmed || undefined);
      await tour.notifyChapterActionSucceeded();
      onOpenChange(false);
      toast.success('Gerando o plano em segundo plano. Acompanhe em Processos de IA.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        tour.exit();
        return;
      }
      // O endpoint responde 202 antes de validar o cadastro: cadastro incompleto
      // (altura, objetivo, ...) agora vira job FAILED, com o motivo exibido no
      // painel de Processos de IA (job.error) em vez de um 422 aqui no diálogo.
      toast.error('Não foi possível gerar o plano. Tente novamente.');
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
            data-tour="patients.plan.ai.confirm"
          >
            {generate.isPending ? 'Gerando…' : '✨ Gerar plano'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
