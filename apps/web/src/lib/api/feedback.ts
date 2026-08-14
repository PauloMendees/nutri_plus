import type {
  DismissFeedbackResponse,
  FeedbackPromptResponse,
  SubmitFeedbackRequest,
  SubmitFeedbackResponse,
} from '@nutri-plus/shared-types';
import { browserApiFetch } from './browser';

export function getFeedbackPrompt(): Promise<FeedbackPromptResponse> {
  return browserApiFetch<FeedbackPromptResponse>('/feedback/prompt');
}

export function submitFeedback(body: SubmitFeedbackRequest): Promise<SubmitFeedbackResponse> {
  return browserApiFetch<SubmitFeedbackResponse>('/feedback', { method: 'POST', body });
}

export function dismissFeedback(): Promise<DismissFeedbackResponse> {
  return browserApiFetch<DismissFeedbackResponse>('/feedback/dismiss', { method: 'POST' });
}
