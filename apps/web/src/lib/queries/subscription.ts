import { useQuery } from '@tanstack/react-query';
import { getSubscription } from '@/lib/api/subscription';

export const SUBSCRIPTION_KEY = ['subscription'] as const;

export function useSubscription() {
  return useQuery({ queryKey: SUBSCRIPTION_KEY, queryFn: getSubscription, staleTime: 30_000 });
}
