import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const startTrial = vi.fn();
const checkout = vi.fn();
vi.mock('@/lib/api/subscription', () => ({
  startTrial: () => startTrial(),
  checkoutSubscription: (b: any) => checkout(b),
  getSubscription: vi.fn(),
}));
const useQuery = vi.fn();
const invalidateQueries = vi.fn().mockResolvedValue(undefined);
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => useQuery(),
  useQueryClient: () => ({ invalidateQueries }),
}));
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: replace }) }));

import AssinaturaPage from './page';
import { SUBSCRIPTION_KEY } from '@/lib/queries/subscription';

beforeEach(() => {
  startTrial.mockReset().mockResolvedValue({ ok: true });
  checkout.mockReset();
  replace.mockClear();
  invalidateQueries.mockClear();
  useQuery.mockReturnValue({ data: { onboardedAt: null, status: 'TRIALING', entitlements: { isReadOnly: true } } });
});

it('no onboarding mostra "Começar teste grátis" e inicia o trial', async () => {
  render(<AssinaturaPage />);
  fireEvent.click(screen.getByRole('button', { name: /começar teste grátis/i }));
  await waitFor(() => expect(startTrial).toHaveBeenCalled());
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  // Sem isso, `/` serve o cache stale de useSubscription e o OnboardingGate
  // manda o usuário de volta pra /assinatura logo após o trial começar.
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: SUBSCRIPTION_KEY });
  const invalidateOrder = invalidateQueries.mock.invocationCallOrder[0];
  const replaceOrder = replace.mock.invocationCallOrder[0];
  expect(invalidateOrder).toBeLessThan(replaceOrder);
});

it('escolher plano + Pix mostra o QR', async () => {
  checkout.mockResolvedValue({ method: 'PIX', pixQrCode: { encodedImage: 'B64', payload: 'p' } });
  render(<AssinaturaPage />);
  fireEvent.click(screen.getAllByRole('button', { name: /assinar/i })[0]);
  fireEvent.click(screen.getByRole('button', { name: /^pix$/i }));
  fireEvent.change(screen.getByLabelText(/cpf\/cnpj/i), { target: { value: '123.456.789-01' } });
  fireEvent.click(screen.getByRole('button', { name: /gerar código pix/i }));
  await waitFor(() => expect(screen.getByAltText(/qr code pix/i)).toBeInTheDocument());
});
