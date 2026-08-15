export const FEEDBACK_SOURCES = ['WEB', 'MOBILE'] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const NUTRITIONIST_PROMPT_DELAY_MS = 72 * 60 * 60 * 1000;
export const PATIENT_PROMPT_DELAY_MS = 168 * 60 * 60 * 1000;
export const FEEDBACK_SNOOZE_MS = 168 * 60 * 60 * 1000;
export const FEEDBACK_COMMENT_MAX = 2000;

export interface FeedbackPromptResponse {
  shouldShow: boolean;
  source: FeedbackSource;
}

export interface SubmitFeedbackRequest {
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
}

export interface SubmitFeedbackResponse {
  ok: true;
}

export interface DismissFeedbackResponse {
  ok: true;
}
