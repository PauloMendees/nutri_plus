import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const useSubscription = vi.fn();
vi.mock('@/lib/queries/subscription', () => ({ useSubscription: () => useSubscription() }));
const cancel = vi.fn();
vi.mock('@/lib/api/subscription', () => ({ cancelSubscription: () => cancel() }));

import { SubscriptionTab } from './subscription-tab';

it('mostra o plano atual e cancela ao confirmar', async () => {
  cancel.mockResolvedValue({ ok: true });
  vi.stubGlobal('confirm', () => true);
  useSubscription.mockReturnValue({ data: { status: 'ACTIVE', plan: 'PRO', billingPeriod: 'MONTHLY', currentPeriodEnd: '2026-09-01T00:00:00.000Z', cancelAtPeriodEnd: false, recentPayments: [], entitlements: { isReadOnly: false } }, refetch: vi.fn() });
  render(<SubscriptionTab />);
  expect(screen.getByText(/Pro/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
  await waitFor(() => expect(cancel).toHaveBeenCalled());
});
