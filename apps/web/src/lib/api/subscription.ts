import type { CheckoutRequest, CheckoutResponse, SubscriptionView } from '@nutri-plus/shared-types';
import { browserApiFetch } from '@/lib/api/browser';

export function getSubscription(): Promise<SubscriptionView> {
  return browserApiFetch<SubscriptionView>('/me/subscription');
}

export function checkoutSubscription(body: CheckoutRequest): Promise<CheckoutResponse> {
  return browserApiFetch<CheckoutResponse>('/me/subscription/checkout', { method: 'POST', body });
}

export function cancelSubscription(): Promise<{ ok: true }> {
  return browserApiFetch<{ ok: true }>('/me/subscription/cancel', { method: 'POST' });
}
