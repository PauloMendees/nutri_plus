'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import { dismissFeedback, submitFeedback } from '@/lib/api/feedback';
import { useFeedbackPrompt } from '@/lib/queries/feedback';
import type { SubmitFeedbackRequest } from '@nutri-plus/shared-types';
import { FeedbackDialog } from './feedback-dialog';

export function FeedbackPromptHost({ enabled }: { enabled: boolean }) {
  const q = useFeedbackPrompt(enabled);
  const [closed, setClosed] = useState(false);
  const [pending, setPending] = useState(false);
  const dismissed = useRef(false);
  const open = enabled && !closed && q.data?.shouldShow === true;

  async function onSubmit(body: SubmitFeedbackRequest) {
    setPending(true);
    try {
      await submitFeedback(body);
      toast.success('Obrigado pelo seu feedback!');
      dismissed.current = true;
      setClosed(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        dismissed.current = true;
        setClosed(true);
        return;
      }
      toast.error('Não foi possível enviar. Tente novamente.');
    } finally {
      setPending(false);
    }
  }

  async function onDismiss() {
    if (dismissed.current) return;
    dismissed.current = true;
    setClosed(true);
    try {
      await dismissFeedback();
    } catch {
      // próximo GET corrige
    }
  }

  return <FeedbackDialog open={open} onSubmit={onSubmit} onDismiss={onDismiss} pending={pending} />;
}
