'use client';

import {
  createContext,
  Suspense,
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
import {
  UserRole,
  type Entitlements,
  type OnboardingTourProgressView,
  type PatchOnboardingTourRequest,
} from '@nutri-plus/shared-types';
import { ApiError } from '@/lib/api/client';
import { getTour, type TourChapter, type TourDefinition, type TourStep } from '@/lib/onboarding/catalog';
import { runFixture } from '@/lib/onboarding/fixtures';
import { chapterView, isAiChapterLocked, isCadastroPlayRecovery } from '@/lib/onboarding/progress';
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
  notifyChapterActionSucceeded(opts?: { demoPatientId?: string }): Promise<boolean>;
};

const noopTour: TourApi = {
  start() {},
  exit() {},
  skipChapter() {},
  isPlayCadastroSubmit() {
    return false;
  },
  notifyChapterActionSucceeded() {
    return Promise.resolve(false);
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

function persistedChapterStatus(
  progress: OnboardingTourProgressView | undefined,
  chapterId: string,
) {
  return progress?.chapters?.find((row) => row.chapterId === chapterId)?.status;
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

function TourUrlHydrator({
  role,
  ready,
  onSearch,
}: {
  role: UserRole | null;
  ready: boolean;
  onSearch: (search: string) => void;
}) {
  const searchParams = useSearchParams();
  const search = `?${searchParams.toString()}`;

  useEffect(() => {
    if (role === UserRole.EMPLOYEE) return;
    if (!ready) return;
    onSearch(search);
  }, [role, ready, search, onSearch]);

  return null;
}

export function TourProvider({ children, role }: { children: ReactNode; role: UserRole | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: onboarding } = useOnboarding();
  const { data: subscription } = useSubscription();
  const { mutateAsync } = usePatchOnboardingTour();

  const [session, setSession] = useState<Session | null>(null);
  const [anchorEl, setAnchorEl] = useState<Element | null>(null);
  const [anchorMissing, setAnchorMissing] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const highlightedStepKeyRef = useRef<string | null>(null);
  const tourProgress = onboarding?.tours.find((t) => t.tourId === 'patients');
  const demoPatientId = tourProgress?.demoPatientId ?? null;
  const demoPatientIdRef = useRef(demoPatientId);
  demoPatientIdRef.current = demoPatientId;
  const tourProgressRef = useRef(tourProgress);
  tourProgressRef.current = tourProgress;
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

  const teardownDriver = useCallback(() => {
    driverRef.current?.destroy();
    driverRef.current = null;
  }, []);

  const dismissSession = useCallback(() => {
    sessionRef.current = null;
    highlightedStepKeyRef.current = null;
    setSession(null);
    setAnchorEl(null);
    setAnchorMissing(false);
    teardownDriver();
  }, [teardownDriver]);

  const exit = useCallback(() => {
    dismissSession();
    routerRef.current.replace(pathnameRef.current);
  }, [dismissSession]);

  const patchIfPlay = useCallback(
    async (mode: Mode, body: PatchOnboardingTourRequest): Promise<boolean> => {
      if (mode !== 'play') return true;
      try {
        await mutateRef.current('patients', body);
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 402) {
          dismissSession();
          routerRef.current.replace(pathnameRef.current);
        }
        return false;
      }
    },
    [dismissSession],
  );

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
      const persisted = persistedChapterStatus(tourProgressRef.current, opts.chapterId);
      if (persisted === 'COMPLETED' || persisted === 'SKIPPED') return;
      void patchIfPlay(mode, {
        chapterId: opts.chapterId,
        chapterStatus: 'IN_PROGRESS',
        furthestStepId: chapter.steps[0]?.id,
      });
    },
    [patchIfPlay],
  );

  const tryStart = useCallback(
    (opts: { tourId: 'patients'; chapterId: string; replay: boolean }): boolean => {
      if (roleRef.current === UserRole.EMPLOYEE) return false;
      const tour = getTour(opts.tourId);
      const chapter = tour?.chapters.find((c) => c.id === opts.chapterId);
      if (!tour || !chapter) return false;

      const progress = tourProgressRef.current;
      const ents = entitlementsRef.current;
      const demoId = demoPatientIdRef.current;
      const view = chapterView(chapter, progress, ents);

      let replay = opts.replay;
      if (replay && view.status !== 'completed' && view.status !== 'skipped') {
        replay = false;
      }

      if (replay) {
        if (chapter.requiresDemo && !demoId) return false;
        beginSession({ tourId: opts.tourId, chapterId: opts.chapterId, replay: true });
        return true;
      }

      if (chapter.id === 'cadastro' && isCadastroPlayRecovery(progress)) {
        beginSession({ tourId: opts.tourId, chapterId: 'cadastro', replay: false });
        return true;
      }

      if (view.status === 'locked' || view.status === 'completed' || view.status === 'skipped') {
        return false;
      }
      if (!isChapterStartable(chapter, demoId, ents)) return false;
      beginSession({ tourId: opts.tourId, chapterId: opts.chapterId, replay: false });
      return true;
    },
    [beginSession],
  );

  const start = useCallback(
    (opts: { tourId: 'patients'; chapterId: string; replay: boolean }) => {
      tryStart(opts);
    },
    [tryStart],
  );

  const hydrateFromSearch = useCallback(
    (search: string) => {
      if (roleRef.current === UserRole.EMPLOYEE) return;
      const parsed = parseTourSearch(search);
      if (!parsed || parsed.tourId !== 'patients') return;
      if (sessionRef.current) return;
      if (!tryStart({ tourId: 'patients', chapterId: parsed.chapterId, replay: parsed.replay })) {
        goToHub();
      }
    },
    [goToHub, tryStart],
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

  const finishChapter = useCallback(
    async (extra?: { demoPatientId?: string }) => {
      const current = sessionRef.current;
      if (!current) return;
      const tour = getTour(current.tourId);
      const chapter = tour?.chapters.find((c) => c.id === current.chapterId);
      if (!tour || !chapter) return;

      if (extra?.demoPatientId) {
        demoPatientIdRef.current = extra.demoPatientId;
      }

      const persisted = persistedChapterStatus(tourProgressRef.current, current.chapterId);
      const terminal = persisted === 'COMPLETED' || persisted === 'SKIPPED';
      const body: PatchOnboardingTourRequest = terminal
        ? {
            chapterId: current.chapterId,
            chapterStatus: persisted,
            ...(extra?.demoPatientId ? { demoPatientId: extra.demoPatientId } : {}),
          }
        : {
            chapterId: current.chapterId,
            chapterStatus: 'COMPLETED',
            furthestStepId: chapter.steps.at(-1)?.id,
            ...(extra?.demoPatientId ? { demoPatientId: extra.demoPatientId } : {}),
          };

      const ok = await patchIfPlay(current.mode, body);
      if (!ok) return;
      if (!sessionRef.current || sessionRef.current.chapterId !== current.chapterId) return;
      continueAfterChapter(current, tour);
    },
    [continueAfterChapter, patchIfPlay],
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

    void finishChapter();
  }, [finishChapter]);

  const skipChapter = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    const tour = getTour(current.tourId);
    if (!tour) return;

    void (async () => {
      const ok = await patchIfPlay(current.mode, {
        chapterId: current.chapterId,
        chapterStatus: 'SKIPPED',
      });
      if (!ok) return;
      if (!sessionRef.current || sessionRef.current.chapterId !== current.chapterId) return;
      continueAfterChapter(current, tour);
    })();
  }, [continueAfterChapter, patchIfPlay]);

  const notifyChapterActionSucceeded = useCallback(
    async (opts?: { demoPatientId?: string }): Promise<boolean> => {
      const current = sessionRef.current;
      if (!current) return false;
      const tour = getTour(current.tourId);
      const chapter = tour?.chapters.find((c) => c.id === current.chapterId);
      const step = chapter?.steps[current.stepIndex];
      if (!step?.awaitAction) return false;
      if (opts?.demoPatientId) {
        demoPatientIdRef.current = opts.demoPatientId;
      }
      const isLast = current.stepIndex >= (chapter?.steps.length ?? 0) - 1;
      if (isLast) {
        await finishChapter(opts);
      } else {
        advance();
      }
      return true;
    },
    [advance, finishChapter],
  );

  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  useEffect(() => {
    if (!session) {
      teardownDriver();
      setAnchorEl(null);
      setAnchorMissing(false);
      return;
    }
    const currentStep = currentStepOf(session);
    if (!currentStep) return;

    const stepKey = `${session.chapterId}:${session.stepIndex}`;
    const alreadyHighlighted = highlightedStepKeyRef.current === stepKey;
    const route = resolveRoute(currentStep, demoPatientId, pathname);
    if (route && pathname !== route && !(currentStep.awaitAction && alreadyHighlighted)) {
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
        highlightedStepKeyRef.current = stepKey;
        setAnchorEl(el);
        setAnchorMissing(false);
        if (!driverRef.current) driverRef.current = createDriver();
        driverRef.current.highlight({
          element: el,
          popover: { showButtons: [], title: '', description: '' },
        });
        return;
      }
      if (currentStep.awaitAction && alreadyHighlighted) {
        timer = window.setTimeout(poll, ANCHOR_POLL_MS);
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
        window.setTimeout(() => {
          advanceRef.current();
        }, 0);
        return;
      }

      if (step.awaitAction) return;

      const current = sessionRef.current;
      const tour = current ? getTour(current.tourId) : undefined;
      const chapter = tour?.chapters.find((c) => c.id === current?.chapterId);
      const nextStep = chapter?.steps[(current?.stepIndex ?? 0) + 1];
      const currentRoute = resolveRoute(step, demoPatientIdRef.current, pathnameRef.current);
      const nextRoute = nextStep
        ? resolveRoute(nextStep, demoPatientIdRef.current, pathnameRef.current)
        : null;
      const waitForNext = Boolean(nextStep && currentRoute && nextRoute && currentRoute === nextRoute);

      const go = () => advanceRef.current();
      if (!waitForNext) {
        window.setTimeout(go, 0);
        return;
      }
      const startedAt = Date.now();
      const poll = () => {
        if (document.querySelector(nextStep!.anchor) || Date.now() - startedAt >= ANCHOR_TIMEOUT_MS) {
          go();
          return;
        }
        window.setTimeout(poll, 50);
      };
      window.setTimeout(poll, 0);
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
        return current?.mode === 'play' && current.chapterId === 'cadastro';
      },
      notifyChapterActionSucceeded,
    }),
    [start, exit, skipChapter, notifyChapterActionSucceeded, session],
  );

  const rect = anchorEl?.getBoundingClientRect();

  return (
    <TourContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <TourUrlHydrator role={role} ready={onboarding != null} onSearch={hydrateFromSearch} />
      </Suspense>
      <style>{`.nutri-tour-hidden-popover{display:none!important}.driver-active *{pointer-events:auto!important}.driver-overlay,.driver-active .driver-overlay,.driver-active .driver-overlay *{pointer-events:none!important}.driver-active .nutri-tour-tooltip,.driver-active .nutri-tour-tooltip *{pointer-events:auto!important}`}</style>
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
