import { useQuery } from '@tanstack/react-query';
import { getFeedbackPrompt } from '@/lib/api/feedback';

export const FEEDBACK_PROMPT_KEY = ['feedback', 'prompt'] as const;

export function useFeedbackPrompt(enabled: boolean) {
  return useQuery({
    queryKey: FEEDBACK_PROMPT_KEY,
    queryFn: getFeedbackPrompt,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}
