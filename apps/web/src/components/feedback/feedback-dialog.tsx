'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import type { SubmitFeedbackRequest } from '@nutri-plus/shared-types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function FeedbackDialog({
  open,
  onSubmit,
  onDismiss,
  pending,
}: {
  open: boolean;
  onSubmit: (body: SubmitFeedbackRequest) => Promise<void>;
  onDismiss: () => void | Promise<void>;
  pending: boolean;
}) {
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [comment, setComment] = useState('');

  async function handleOpenChange(next: boolean) {
    if (!next) await onDismiss();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>O que você está achando do iNutri?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Sua opinião nos ajuda a melhorar. Tem alguma sugestão ou encontrou algum problema?
          </p>
        </DialogHeader>
        <div className="flex gap-1" role="group" aria-label="Nota de 1 a 5">
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Nota ${n}`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              className="rounded-md p-1"
            >
              <Star className={rating !== null && n <= rating ? 'fill-current' : ''} />
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="feedback-comment">Sugestão ou correção (opcional)</Label>
          <Textarea
            id="feedback-comment"
            rows={4}
            placeholder="Sugestão ou correção (opcional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        <DialogFooter className="justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => onDismiss()} disabled={pending}>
            Agora não
          </Button>
          <Button
            type="button"
            className="rounded-full"
            disabled={pending || rating === null}
            onClick={() => rating && onSubmit({ rating, comment: comment.trim() || undefined })}
          >
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
