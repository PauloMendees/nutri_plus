import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const useSubscription = vi.fn();
vi.mock('@/lib/queries/subscription', () => ({ useSubscription: () => useSubscription() }));
const cancel = vi.fn();
const updatePM = vi.fn();
vi.mock('@/lib/api/subscription', () => ({
  cancelSubscription: () => cancel(),
  updatePaymentMethod: (b: unknown) => updatePM(b),
}));

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

it('mostra o método atual e muda para Pix', async () => {
  cancel.mockResolvedValue?.({ ok: true });
  updatePM.mockResolvedValue({ ok: true });
  vi.stubGlobal('confirm', () => true);
  useSubscription.mockReturnValue({ data: { status: 'ACTIVE', plan: 'PRO', billingPeriod: 'MONTHLY', currentPeriodEnd: '2026-09-01T00:00:00Z', cancelAtPeriodEnd: false, recentPayments: [], entitlements: { isReadOnly: false }, paymentMethod: 'CREDIT_CARD', cardLast4: '1234', cardBrand: 'VISA' }, refetch: vi.fn() });
  render(<SubscriptionTab />);
  expect(screen.getByText(/1234/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /mudar para pix/i }));
  await waitFor(() => expect(updatePM).toHaveBeenCalledWith(expect.objectContaining({ method: 'PIX' })));
});
