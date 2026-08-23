import type { Entitlements, OnboardingTourProgressView } from '@nutri-plus/shared-types';
import type { DemoKind, TourChapter, TourDefinition } from './catalog';

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
  const row = tour?.chapters?.find((c) => c.chapterId === chapter.id);
  if (row?.status === 'COMPLETED' || row?.status === 'SKIPPED') {
    if (chapter.requiresDemo && !tour?.demoPatientId) {
      return { status: 'locked', lockReason: 'demo' };
    }
    return {
      status: row.status === 'COMPLETED' ? 'completed' : 'skipped',
      lockReason: null,
    };
  }

  if (chapter.requires === 'ai' && isAiChapterLocked(entitlements)) {
    return { status: 'locked', lockReason: 'ai' };
  }
  if (chapter.requiresDemo && !tour?.demoPatientId) {
    return { status: 'locked', lockReason: 'demo' };
  }

  if (!row) return { status: 'todo', lockReason: null };
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

export function demoRefOf(
  tour: OnboardingTourProgressView | undefined,
  kind: DemoKind,
): string | null {
  if (!tour) return null;
  if (kind === 'patient') return tour.demoPatientId;
  if (kind === 'appointment') return tour.demoAppointmentId;
  return tour.demoTransactionId;
}

/** A createsDemo chapter is terminal but its entity is gone — and other
 * chapters of this tour depend on that entity: play it again to recreate. */
export function isDemoPlayRecovery(
  def: TourDefinition,
  chapter: TourChapter,
  tour: OnboardingTourProgressView | undefined,
): boolean {
  if (!chapter.createsDemo) return false;
  if (!def.chapters.some((c) => c.requiresDemo)) return false;
  if (demoRefOf(tour, chapter.createsDemo)) return false;
  const row = tour?.chapters?.find((c) => c.chapterId === chapter.id);
  return row?.status === 'COMPLETED' || row?.status === 'SKIPPED';
}

export function playRecoveryChapterId(
  def: TourDefinition,
  tour: OnboardingTourProgressView | undefined,
): string | null {
  return def.chapters.find((chapter) => isDemoPlayRecovery(def, chapter, tour))?.id ?? null;
}

export function continuePlayChapterId(
  def: TourDefinition,
  tour: OnboardingTourProgressView | undefined,
  entitlements: Entitlements | undefined,
): string | null {
  return firstIncompleteChapterId(def, tour, entitlements) ?? playRecoveryChapterId(def, tour);
}
