import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  DismissFeedbackResponse,
  FeedbackPromptResponse,
  SubmitFeedbackRequest,
  SubmitFeedbackResponse,
} from '@nutri-plus/shared-types';
import { apiFetch } from '../api';

export function useFeedbackPrompt(enabled = true) {
  return useQuery({
    queryKey: ['feedback', 'prompt'],
    queryFn: () => apiFetch<FeedbackPromptResponse>('/feedback/prompt'),
    enabled,
    retry: false,
  });
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (body: SubmitFeedbackRequest) =>
      apiFetch<SubmitFeedbackResponse>('/feedback', { method: 'POST', body }),
  });
}

export function useDismissFeedback() {
  return useMutation({
    mutationFn: () => apiFetch<DismissFeedbackResponse>('/feedback/dismiss', { method: 'POST' }),
  });
}
