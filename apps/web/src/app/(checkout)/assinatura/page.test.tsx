import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const startTrial = vi.fn();
const checkout = vi.fn();
const changePlan = vi.fn();
const previewChangePlan = vi.fn();
vi.mock('@/lib/api/subscription', () => ({
  startTrial: () => startTrial(),
  checkoutSubscription: (b: any) => checkout(b),
  changePlan: (b: any) => changePlan(b),
  previewChangePlan: (b: any) => previewChangePlan(b),
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
  changePlan.mockReset();
  previewChangePlan.mockReset();
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

it('assinante ativo NÃO é redirecionado e vê o picker com o plano atual', () => {
  useQuery.mockReturnValue({
    data: {
      status: 'ACTIVE',
      plan: 'ESSENCIAL',
      billingPeriod: 'MONTHLY',
      onboardedAt: '2026-08-01T00:00:00Z',
      entitlements: { isReadOnly: false },
    },
  });
  render(<AssinaturaPage />);
  expect(replace).not.toHaveBeenCalledWith('/');
  expect(screen.getByText(/seu plano atual/i)).toBeInTheDocument();
});

it('upgrade no cartão: escolher plano mostra o preview; confirmar chama changePlan e mostra sucesso', async () => {
  previewChangePlan.mockResolvedValue({ kind: 'UPGRADE', amountNow: 25, recurringValue: 99, recurringPeriod: 'MONTHLY', effectiveDate: '2026-08-20T00:00:00Z' });
  changePlan.mockResolvedValue({ kind: 'UPGRADE', method: 'CREDIT_CARD', status: 'ACTIVE', amount: 25 });
  useQuery.mockReturnValue({
    data: {
      status: 'ACTIVE',
      plan: 'ESSENCIAL',
      billingPeriod: 'MONTHLY',
      paymentMethod: 'CREDIT_CARD',
      onboardedAt: '2026-08-01T00:00:00Z',
      entitlements: { isReadOnly: false },
    },
  });
  render(<AssinaturaPage />);
  fireEvent.click(screen.getByRole('button', { name: /trocar para pro/i }));
  await waitFor(() => expect(previewChangePlan).toHaveBeenCalledWith({ plan: 'PRO', period: 'MONTHLY' }));
  // painel de confirmação com os valores
  await waitFor(() => expect(screen.getByText(/agora/i)).toBeInTheDocument());
  expect(screen.getByText(/99/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /confirmar troca/i }));
  await waitFor(() => expect(changePlan).toHaveBeenCalledWith({ plan: 'PRO', period: 'MONTHLY' }));
  await waitFor(() => expect(screen.getByText(/upgrade|pagou|plano alterado/i)).toBeInTheDocument());
});

it('preview agendado mostra "sem cobrança agora"; Voltar retorna ao picker sem chamar changePlan', async () => {
  previewChangePlan.mockResolvedValue({ kind: 'SCHEDULED', amountNow: 0, recurringValue: 49, recurringPeriod: 'MONTHLY', effectiveDate: '2026-09-01T00:00:00Z' });
  useQuery.mockReturnValue({
    data: {
      status: 'ACTIVE',
      plan: 'PRO',
      billingPeriod: 'MONTHLY',
      paymentMethod: 'CREDIT_CARD',
      onboardedAt: '2026-08-01T00:00:00Z',
      entitlements: { isReadOnly: false },
    },
  });
  render(<AssinaturaPage />);
  fireEvent.click(screen.getByRole('button', { name: /trocar para essencial/i }));
  await waitFor(() => expect(screen.getByText(/sem cobrança agora/i)).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /trocar para essencial/i })).toBeInTheDocument());
  expect(changePlan).not.toHaveBeenCalled();
});
