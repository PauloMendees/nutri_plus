'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { UserRole, type Entitlements, type PatchOnboardingTourRequest } from '@nutri-plus/shared-types';
import { getTour, type TourChapter, type TourDefinition, type TourStep } from '@/lib/onboarding/catalog';
import { runFixture } from '@/lib/onboarding/fixtures';
import { isAiChapterLocked } from '@/lib/onboarding/progress';
import { buildTourSearch, parseTourSearch } from '@/lib/onboarding/session';
import { useOnboarding, usePatchOnboardingTour } from '@/lib/queries/onboarding';
import { useSubscription } from '@/lib/queries/subscription';
import { TourMissingAnchor, TourTooltip } from './tour-tooltip';

type Mode = 'play' | 'replay';

type Session = {
  tourId: 'patients';
  chapterId: string;
  stepIndex: number;
  mode: Mode;
};

export type TourApi = {
  start(opts: { tourId: 'patients'; chapterId: string; replay: boolean }): void;
  exit(): void;
  skipChapter(): void;
  isPlayCadastroSubmit(): boolean;
};

const noopTour: TourApi = {
  start() {},
  exit() {},
  skipChapter() {},
  isPlayCadastroSubmit() {
    return false;
  },
};

const TourContext = createContext<TourApi>(noopTour);

export function useTour(): TourApi {
  return useContext(TourContext);
}

const ANCHOR_POLL_MS = 100;
const ANCHOR_TIMEOUT_MS = 5000;

function resolveRoute(
  step: TourStep,
  demoPatientId: string | null | undefined,
  pathname?: string | null,
): string | null {
  if (typeof step.route === 'string') return step.route;
  if (!demoPatientId) return null;
  return step.route({ demoPatientId, pathname: pathname ?? undefined });
}

function currentStepOf(session: Session | null): TourStep | undefined {
  if (!session) return undefined;
  const tour = getTour(session.tourId);
  const chapter = tour?.chapters.find((c) => c.id === session.chapterId);
  return chapter?.steps[session.stepIndex];
}

function isChapterStartable(
  chapter: TourChapter,
  demoPatientId: string | null,
  entitlements: Entitlements | undefined,
): boolean {
  if (chapter.requires === 'ai' && isAiChapterLocked(entitlements)) return false;
  if (chapter.requiresDemo && !demoPatientId) return false;
  return true;
}

function nextStartableChapter(
  tour: TourDefinition,
  afterChapterId: string,
  demoPatientId: string | null,
  entitlements: Entitlements | undefined,
): TourChapter | undefined {
  const idx = tour.chapters.findIndex((c) => c.id === afterChapterId);
  return tour.chapters.slice(idx + 1).find((c) => isChapterStartable(c, demoPatientId, entitlements));
}

function createDriver() {
  return driver({
    allowClose: false,
    overlayClickBehavior: () => {},
    showButtons: [],
    advanceOnClick: false,
    disableActiveInteraction: false,
    popoverClass: 'nutri-tour-hidden-popover',
  });
}

export function TourProvider({ children, role }: { children: ReactNode; role: UserRole | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: onboarding } = useOnboarding();
  const { data: subscription } = useSubscription();
  const { mutateAsync } = usePatchOnboardingTour();

  const [session, setSession] = useState<Session | null>(null);
  const [anchorEl, setAnchorEl] = useState<Element | null>(null);
  const [anchorMissing, setAnchorMissing] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const demoPatientId = onboarding?.tours.find((t) => t.tourId === 'patients')?.demoPatientId ?? null;
  const demoPatientIdRef = useRef(demoPatientId);
  demoPatientIdRef.current = demoPatientId;
  const entitlements = subscription?.entitlements;
  const entitlementsRef = useRef(entitlements);
  entitlementsRef.current = entitlements;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const routerRef = useRef(router);
  routerRef.current = router;
  const mutateRef = useRef(mutateAsync);
  mutateRef.current = mutateAsync;
  const roleRef = useRef(role);
  roleRef.current = role;

  const step = currentStepOf(session);

  const patchIfPlay = useCallback((mode: Mode, body: PatchOnboardingTourRequest) => {
    if (mode !== 'play') return;
    return Promise.resolve(mutateRef.current('patients', body)).catch(() => undefined);
  }, []);

  const teardownDriver = useCallback(() => {
    driverRef.current?.destroy();
    driverRef.current = null;
  }, []);

  const dismissSession = useCallback(() => {
    sessionRef.current = null;
    setSession(null);
    setAnchorEl(null);
    setAnchorMissing(false);
    teardownDriver();
  }, [teardownDriver]);

  const exit = useCallback(() => {
    dismissSession();
    routerRef.current.replace(pathnameRef.current);
  }, [dismissSession]);

  const goToHub = useCallback(() => {
    dismissSession();
    routerRef.current.push('/primeiros-passos');
  }, [dismissSession]);

  const beginSession = useCallback(
    (opts: { tourId: 'patients'; chapterId: string; replay: boolean }) => {
      const tour = getTour(opts.tourId);
      const chapter = tour?.chapters.find((c) => c.id === opts.chapterId);
      if (!tour || !chapter) return;
      const mode: Mode = opts.replay ? 'replay' : 'play';
      const next: Session = { tourId: opts.tourId, chapterId: opts.chapterId, stepIndex: 0, mode };
      sessionRef.current = next;
      setSession(next);
      setAnchorEl(null);
      setAnchorMissing(false);
      const search = buildTourSearch({
        tourId: opts.tourId,
        chapterId: opts.chapterId,
        replay: opts.replay,
      });
      const firstRoute =
        resolveRoute(chapter.steps[0], demoPatientIdRef.current, pathnameRef.current) ??
        pathnameRef.current;
      routerRef.current.replace(`${firstRoute}${search}`);
      void patchIfPlay(mode, {
        chapterId: opts.chapterId,
        chapterStatus: 'IN_PROGRESS',
        furthestStepId: chapter.steps[0]?.id,
      });
    },
    [patchIfPlay],
  );

  const start = useCallback(
    (opts: { tourId: 'patients'; chapterId: string; replay: boolean }) => {
      if (roleRef.current === UserRole.EMPLOYEE) return;
      beginSession(opts);
    },
    [beginSession],
  );

  const continueAfterChapter = useCallback(
    (current: Session, tour: TourDefinition) => {
      const nextChapter = nextStartableChapter(
        tour,
        current.chapterId,
        demoPatientIdRef.current,
        entitlementsRef.current,
      );
      if (!nextChapter) {
        const idx = tour.chapters.findIndex((c) => c.id === current.chapterId);
        const remaining = tour.chapters.slice(idx + 1);
        const tourDone =
          remaining.length === 0 ||
          remaining.every((c) => c.requires === 'ai' && isAiChapterLocked(entitlementsRef.current));
        if (tourDone) void patchIfPlay(current.mode, { tourStatus: 'COMPLETED' });
        goToHub();
        return;
      }
      beginSession({
        tourId: current.tourId,
        chapterId: nextChapter.id,
        replay: current.mode === 'replay',
      });
    },
    [beginSession, goToHub, patchIfPlay],
  );

  const advance = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    const tour = getTour(current.tourId);
    const chapter = tour?.chapters.find((c) => c.id === current.chapterId);
    if (!tour || !chapter) return;

    const nextIndex = current.stepIndex + 1;
    if (nextIndex < chapter.steps.length) {
      const nextStep = chapter.steps[nextIndex];
      const next: Session = { ...current, stepIndex: nextIndex };
      sessionRef.current = next;
      setSession(next);
      setAnchorEl(null);
      const route = resolveRoute(nextStep, demoPatientIdRef.current, pathnameRef.current);
      if (route && pathnameRef.current !== route) {
        routerRef.current.push(route);
      }
      return;
    }

    void patchIfPlay(current.mode, {
      chapterId: current.chapterId,
      chapterStatus: 'COMPLETED',
      furthestStepId: chapter.steps.at(-1)?.id,
    });
    continueAfterChapter(current, tour);
  }, [continueAfterChapter, patchIfPlay]);

  const skipChapter = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    const tour = getTour(current.tourId);
    if (!tour) return;

    void patchIfPlay(current.mode, {
      chapterId: current.chapterId,
      chapterStatus: 'SKIPPED',
    });
    continueAfterChapter(current, tour);
  }, [continueAfterChapter, patchIfPlay]);

  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  useEffect(() => {
    if (role === UserRole.EMPLOYEE) return;
    const parsed = parseTourSearch(`?${searchParams.toString()}`);
    if (!parsed || parsed.tourId !== 'patients') return;
    if (sessionRef.current) return;
    start({ tourId: 'patients', chapterId: parsed.chapterId, replay: parsed.replay });
  }, [role, searchParams, start]);

  useEffect(() => {
    if (!session) {
      teardownDriver();
      setAnchorEl(null);
      setAnchorMissing(false);
      return;
    }
    const currentStep = currentStepOf(session);
    if (!currentStep) return;

    const route = resolveRoute(currentStep, demoPatientId, pathname);
    if (route && pathname !== route) {
      routerRef.current.push(route);
    }

    let cancelled = false;
    setAnchorEl(null);
    setAnchorMissing(false);
    const startedAt = Date.now();
    let timer = 0;

    const poll = () => {
      if (cancelled) return;
      const el = document.querySelector(currentStep.anchor);
      if (el) {
        setAnchorEl(el);
        setAnchorMissing(false);
        if (!driverRef.current) driverRef.current = createDriver();
        driverRef.current.highlight({
          element: el,
          popover: { showButtons: [], title: '', description: '' },
        });
        return;
      }
      if (Date.now() - startedAt >= ANCHOR_TIMEOUT_MS) {
        teardownDriver();
        setAnchorEl(null);
        setAnchorMissing(true);
        return;
      }
      timer = window.setTimeout(poll, ANCHOR_POLL_MS);
    };

    timer = window.setTimeout(poll, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [session, pathname, demoPatientId, teardownDriver]);

  useEffect(() => {
    if (!session || !step || step.advance !== 'click') return;

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(step.anchor)) return;

      const replayCadastroSubmit =
        session.mode === 'replay' && session.chapterId === 'cadastro' && step.id === 'submit';
      if (replayCadastroSubmit) {
        event.preventDefault();
        event.stopPropagation();
        const demoId = demoPatientIdRef.current;
        if (demoId) routerRef.current.push(`/patients/${demoId}`);
      }

      window.setTimeout(() => {
        advanceRef.current();
      }, 0);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [session, step]);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, []);

  const value = useMemo<TourApi>(
    () => ({
      start,
      exit,
      skipChapter,
      isPlayCadastroSubmit() {
        const current = sessionRef.current;
        const currentStep = currentStepOf(current);
        return current?.mode === 'play' && current.chapterId === 'cadastro' && currentStep?.id === 'submit';
      },
    }),
    [start, exit, skipChapter],
  );

  const rect = anchorEl?.getBoundingClientRect();

  return (
    <TourContext.Provider value={value}>
      {children}
      <style>{`.nutri-tour-hidden-popover{display:none!important}`}</style>
      {anchorMissing ? <TourMissingAnchor onBackToHub={goToHub} /> : null}
      {step && rect && !anchorMissing ? (
        <TourTooltip
          title={step.title}
          body={step.body}
          rect={rect}
          fixture={step.fixture}
          advance={step.advance}
          onSkipChapter={skipChapter}
          onExit={exit}
          onFillFixture={step.fixture ? () => runFixture(step.fixture as string) : undefined}
          onNext={step.advance === 'next' ? () => advance() : undefined}
        />
      ) : null}
    </TourContext.Provider>
  );
}
