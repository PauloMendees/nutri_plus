import { describe, it, expect, vi, beforeEach } from 'vitest';
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

beforeEach(() => {
  cancel.mockReset();
  updatePM.mockReset();
});

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
  fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
  await waitFor(() => expect(updatePM).toHaveBeenCalledWith(expect.objectContaining({ method: 'PIX' })));
});

it('traduz status/método das faturas para português', () => {
  useSubscription.mockReturnValue({ data: { status: 'ACTIVE', plan: 'PRO', billingPeriod: 'MONTHLY', currentPeriodEnd: '2026-09-01T00:00:00Z', cancelAtPeriodEnd: false, paymentMethod: 'PIX', cardLast4: null, cardBrand: null, entitlements: { isReadOnly: false }, recentPayments: [{ id: 'p1', amount: 99, status: 'CONFIRMED', billingType: 'CREDIT_CARD', dueDate: '2026-08-10T00:00:00Z', paidAt: null }] }, refetch: vi.fn() });
  render(<SubscriptionTab />);
  expect(screen.getByText('Pago')).toBeInTheDocument();
  expect(screen.getByText('Cartão')).toBeInTheDocument();
});

it('pede confirmação num dialog antes de mudar para Pix', async () => {
  updatePM.mockResolvedValue({ ok: true });
  useSubscription.mockReturnValue({ data: { status: 'ACTIVE', plan: 'PRO', billingPeriod: 'MONTHLY', currentPeriodEnd: '2026-09-01T00:00:00Z', cancelAtPeriodEnd: false, paymentMethod: 'CREDIT_CARD', cardLast4: '1234', cardBrand: 'VISA', entitlements: { isReadOnly: false }, recentPayments: [] }, refetch: vi.fn() });
  render(<SubscriptionTab />);
  fireEvent.click(screen.getByRole('button', { name: /mudar para pix/i }));
  // abre o dialog de confirmação; só executa ao confirmar
  expect(updatePM).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
  await waitFor(() => expect(updatePM).toHaveBeenCalledWith({ method: 'PIX' }));
});

it('não submete um <form> ao redor ao clicar "Atualizar cartão" (type=button)', () => {
  // Regressão: SubscriptionTab é renderizado dentro do <form> de Configurações.
  // Sem type="button", os botões viram submit e disparam PATCH /nutritionist-settings
  // + toast "Configurações salvas." sem o usuário ter salvado nada.
  const onSubmit = vi.fn((e) => e.preventDefault());
  useSubscription.mockReturnValue({ data: { status: 'ACTIVE', plan: 'PRO', billingPeriod: 'MONTHLY', currentPeriodEnd: '2026-09-01T00:00:00Z', cancelAtPeriodEnd: false, paymentMethod: 'CREDIT_CARD', cardLast4: '1234', cardBrand: 'VISA', entitlements: { isReadOnly: false }, recentPayments: [] }, refetch: vi.fn() });
  render(
    <form onSubmit={onSubmit}>
      <SubscriptionTab />
    </form>,
  );
  fireEvent.click(screen.getByRole('button', { name: /atualizar cartão/i }));
  expect(onSubmit).not.toHaveBeenCalled();
});
