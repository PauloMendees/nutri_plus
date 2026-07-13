'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { MealPlanDraft } from '@nutri-plus/shared-types';
import { useAdjustMealPlan } from '@/lib/queries/meal-plans';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function AiAdjustDialog({
  open,
  onOpenChange,
  planId,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  onApplied: (draft: MealPlanDraft) => void;
}) {
  const adjust = useAdjustMealPlan(planId);
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    if (open) setInstructions('');
  }, [open]);

  async function onAdjust() {
    const trimmed = instructions.trim();
    if (!trimmed) return;
    try {
      const draft = await adjust.mutateAsync(trimmed);
      onOpenChange(false);
      onApplied(draft);
    } catch {
      toast.error('Não foi possível ajustar o plano. Tente novamente.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar ajustes à IA</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="ai-adjust" className="text-sm font-medium">
            O que ajustar neste plano?
          </label>
          <Textarea
            id="ai-adjust"
            rows={4}
            maxLength={2000}
            placeholder="Ex.: reduzir o carboidrato do jantar; incluir uma opção vegetariana no almoço."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            A IA gera uma nova versão para você revisar. Nada é salvo até você clicar em Salvar. As metas do dia, alergias e restrições são mantidas.
          </p>
        </div>

        <DialogFooter className="justify-end">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={adjust.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-full shadow-sm shadow-primary/30"
            onClick={onAdjust}
            disabled={adjust.isPending || instructions.trim().length === 0}
          >
            {adjust.isPending ? 'Ajustando…' : '✨ Ajustar plano'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
