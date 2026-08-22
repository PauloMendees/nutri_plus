import type { Entitlements, OnboardingTourProgressView } from '@nutri-plus/shared-types';
import type { TourChapter, TourDefinition } from './catalog';

export function isAiChapterLocked(entitlements: Entitlements | undefined): boolean {
  return !entitlements || entitlements.isReadOnly || entitlements.aiUsed >= entitlements.aiQuota;
}

export function chapterView(
  chapter: TourChapter,
  tour: OnboardingTourProgressView | undefined,
  entitlements: Entitlements | undefined,
): {
  status: 'todo' | 'in_progress' | 'completed' | 'skipped' | 'locked';
  lockReason: 'ai' | 'demo' | null;
} {
  if (chapter.requires === 'ai' && isAiChapterLocked(entitlements)) {
    return { status: 'locked', lockReason: 'ai' };
  }
  if (chapter.requiresDemo && !tour?.demoPatientId) {
    return { status: 'locked', lockReason: 'demo' };
  }

  const row = tour?.chapters.find((c) => c.chapterId === chapter.id);
  if (!row) return { status: 'todo', lockReason: null };
  if (row.status === 'COMPLETED') return { status: 'completed', lockReason: null };
  if (row.status === 'SKIPPED') return { status: 'skipped', lockReason: null };
  return { status: 'in_progress', lockReason: null };
}

export function primaryCta(tour: OnboardingTourProgressView | undefined): 'start' | 'continue' | 'review' {
  if (!tour) return 'start';
  if (tour.status === 'IN_PROGRESS') return 'continue';
  return 'review';
}

export function firstIncompleteChapterId(
  def: TourDefinition,
  tour: OnboardingTourProgressView | undefined,
  entitlements: Entitlements | undefined,
): string | null {
  for (const chapter of def.chapters) {
    const { status } = chapterView(chapter, tour, entitlements);
    if (status === 'completed' || status === 'skipped' || status === 'locked') continue;
    return chapter.id;
  }
  return null;
}
