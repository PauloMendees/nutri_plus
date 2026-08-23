'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OnboardingMeView } from '@nutri-plus/shared-types';
import { useDismissOnboardingPrompt, useOnboarding } from '@/lib/queries/onboarding';
import { useSubscription } from '@/lib/queries/subscription';
import { FirstRunDialog } from './first-run-dialog';

function shouldOpenFirstRun(
  onboardedAt: string | null | undefined,
  onboarding: OnboardingMeView | undefined,
) {
  if (onboardedAt == null) return false;
  if (!onboarding) return false;
  if (onboarding.promptDismissedAt) return false;
  if (onboarding.tours.some((tour) => tour.status === 'IN_PROGRESS' || tour.status === 'COMPLETED')) {
    return false;
  }
  return true;
}

export function FirstRunHost() {
  const router = useRouter();
  const { data: onboarding } = useOnboarding();
  const { data: subscription } = useSubscription();
  const dismiss = useDismissOnboardingPrompt();
  const skipDismissRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [closed, setClosed] = useState(false);

  const open =
    !started && !closed && shouldOpenFirstRun(subscription?.onboardedAt, onboarding);

  function onDismiss() {
    if (skipDismissRef.current) return;
    skipDismissRef.current = true;
    setClosed(true);
    void dismiss.mutateAsync().catch(() => undefined);
  }

  function onStart() {
    skipDismissRef.current = true;
    setStarted(true);
    router.push('/primeiros-passos');
  }

  return <FirstRunDialog open={open} onDismiss={onDismiss} onStart={onStart} />;
}
