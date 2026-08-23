export const ONBOARDING_TOUR_IDS = [
  'patients',
  'agenda',
  'contabilidade',
  'alimentos',
  'configuracoes',
] as const;
export type OnboardingTourId = (typeof ONBOARDING_TOUR_IDS)[number];

export type OnboardingTourStatus = 'IN_PROGRESS' | 'COMPLETED';
export type OnboardingChapterStatus = 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export interface OnboardingChapterProgressView {
  chapterId: string;
  status: OnboardingChapterStatus;
  furthestStepId: string | null;
  completedAt: string | null;
}

export interface OnboardingTourProgressView {
  tourId: string;
  status: OnboardingTourStatus;
  demoPatientId: string | null;
  demoAppointmentId: string | null;
  demoTransactionId: string | null;
  completedAt: string | null;
  chapters: OnboardingChapterProgressView[];
}

export interface OnboardingMeView {
  promptDismissedAt: string | null;
  tours: OnboardingTourProgressView[];
}

export interface PatchOnboardingPromptRequest {
  promptDismissed: true;
}

export interface PatchOnboardingTourRequest {
  chapterId?: string;
  chapterStatus?: OnboardingChapterStatus;
  furthestStepId?: string;
  demoPatientId?: string | null;
  demoAppointmentId?: string | null;
  demoTransactionId?: string | null;
  tourStatus?: 'COMPLETED';
}

export function isOnboardingTourId(value: string): value is OnboardingTourId {
  return (ONBOARDING_TOUR_IDS as readonly string[]).includes(value);
}
