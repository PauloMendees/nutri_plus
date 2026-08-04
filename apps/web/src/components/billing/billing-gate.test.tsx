import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const useSubscription = vi.fn();
vi.mock('@/lib/queries/subscription', () => ({ useSubscription: () => useSubscription(), SUBSCRIPTION_KEY: ['subscription'] }));

import { BillingGate } from './billing-gate';
import { emitBilling } from '@/lib/billing/billing-events';

beforeEach(() => { push.mockClear(); });

it('mostra banner de trial com dias restantes', () => {
  const in3 = new Date(Date.now() + 3 * 86400_000).toISOString();
  useSubscription.mockReturnValue({ data: { status: 'TRIALING', isComp: false, trialEndsAt: in3, entitlements: { isReadOnly: false } } });
  render(<BillingGate />);
  expect(screen.getByText(/teste/i)).toBeInTheDocument();
});

it('banner de somente-leitura quando isReadOnly', () => {
  useSubscription.mockReturnValue({ data: { status: 'PAST_DUE', isComp: false, trialEndsAt: null, entitlements: { isReadOnly: true } } });
  render(<BillingGate />);
  expect(screen.getByText(/somente leitura/i)).toBeInTheDocument();
});

it('evento FEATURE_PRO_ONLY abre modal de upsell', () => {
  useSubscription.mockReturnValue({ data: { status: 'ACTIVE', isComp: false, trialEndsAt: null, entitlements: { isReadOnly: false } } });
  render(<BillingGate />);
  act(() => emitBilling('FEATURE_PRO_ONLY', 'silhueta'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('evento READ_ONLY redireciona ao paywall', () => {
  useSubscription.mockReturnValue({ data: { status: 'PAST_DUE', isComp: false, trialEndsAt: null, entitlements: { isReadOnly: true } } });
  render(<BillingGate />);
  act(() => emitBilling('READ_ONLY'));
  expect(push).toHaveBeenCalledWith('/assinatura');
});
