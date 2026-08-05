'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSubscription } from '@/lib/queries/subscription';

export function OnboardingGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { data } = useSubscription();
  useEffect(() => {
    if (data && data.onboardedAt === null && pathname !== '/assinatura') router.replace('/assinatura');
  }, [data, pathname, router]);
  return null;
}
