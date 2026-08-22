import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const startTrial = vi.fn();
const checkout = vi.fn();
const changePlan = vi.fn();
const previewChangePlan = vi.fn();
const trackMetaEvent = vi.fn();
vi.mock('@/lib/analytics/meta-events', () => ({
  trackMetaEvent: (...a: unknown[]) => trackMetaEvent(...a),
  checkoutValue: (plan: string, period: string) => (plan === 'PRO' ? (period === 'YEARLY' ? 990 : 99) : period === 'YEARLY' ? 490 : 49),
}));
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
const back = vi.fn();
let currentSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: replace, back }),
  useSearchParams: () => currentSearchParams,
}));

import AssinaturaPage from './page';
import { SUBSCRIPTION_KEY } from '@/lib/queries/subscription';

beforeEach(() => {
  startTrial.mockReset().mockResolvedValue({ ok: true });
  checkout.mockReset();
  changePlan.mockReset();
  previewChangePlan.mockReset();
  replace.mockClear();
  back.mockClear();
  invalidateQueries.mockClear();
  useQuery.mockReturnValue({ data: { onboardedAt: null, status: 'TRIALING', entitlements: { isReadOnly: true } } });
  currentSearchParams = new URLSearchParams();
  trackMetaEvent.mockReset();
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
  expect(trackMetaEvent).toHaveBeenCalledWith('StartTrial', { value: 0, currency: 'BRL' });
});

it('não dispara StartTrial quando o trial falha', async () => {
  startTrial.mockRejectedValue(new Error('nope'));
  render(<AssinaturaPage />);
  fireEvent.click(screen.getByRole('button', { name: /começar teste grátis/i }));
  await waitFor(() => expect(startTrial).toHaveBeenCalled());
  expect(replace).not.toHaveBeenCalled();
  expect(trackMetaEvent).not.toHaveBeenCalledWith('StartTrial', expect.anything());
});

it('escolher plano + Pix mostra o QR', async () => {
  checkout.mockResolvedValue({ method: 'PIX', pixQrCode: { encodedImage: 'B64', payload: 'p' } });
  render(<AssinaturaPage />);
  fireEvent.click(screen.getAllByRole('button', { name: /assinar/i })[0]);
  fireEvent.click(screen.getByRole('button', { name: /^pix$/i }));
  fireEvent.change(screen.getByLabelText(/cpf\/cnpj/i), { target: { value: '123.456.789-01' } });
  fireEvent.click(screen.getByRole('button', { name: /gerar código pix/i }));
  await waitFor(() => expect(screen.getByAltText(/qr code pix/i)).toBeInTheDocument());
  expect(trackMetaEvent).toHaveBeenCalledWith(
    'InitiateCheckout',
    expect.objectContaining({ content_name: 'ESSENCIAL', currency: 'BRL', value: 49 }),
  );
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

it('upgrade: mostra o valor DENTRO do card e troca direto ao clicar (sem passo extra)', async () => {
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
  // valor aparece DENTRO do card, sem precisar clicar
  await waitFor(() => expect(previewChangePlan).toHaveBeenCalledWith({ plan: 'PRO', period: 'MONTHLY' }));
  await waitFor(() => expect(screen.getByText(/25,00 agora/i)).toBeInTheDocument());
  expect(screen.getByText(/99,00\/mês/i)).toBeInTheDocument();
  // clicar troca DIRETO (sem passo de confirmação)
  fireEvent.click(screen.getByRole('button', { name: /trocar para pro/i }));
  await waitFor(() => expect(changePlan).toHaveBeenCalledWith({ plan: 'PRO', period: 'MONTHLY' }));
  await waitFor(() => expect(screen.getByText(/upgrade|pagou|plano alterado/i)).toBeInTheDocument());
});

it('assinante ativo vê "Cancelar" no picker que volta para a página anterior', () => {
  previewChangePlan.mockResolvedValue({ kind: 'UPGRADE', amountNow: 25, recurringValue: 99, recurringPeriod: 'MONTHLY', effectiveDate: '2026-08-20T00:00:00Z' });
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
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
  expect(back).toHaveBeenCalled();
  expect(changePlan).not.toHaveBeenCalled();
});

it('?plan=pro pulando o picker abre o checkout do Pro', async () => {
  currentSearchParams = new URLSearchParams('plan=pro');
  render(<AssinaturaPage />);
  expect(await screen.findByRole('button', { name: /^pix$/i })).toBeInTheDocument();
  expect(screen.getByText(/mensal/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /começar teste grátis/i })).not.toBeInTheDocument();
  expect(trackMetaEvent).toHaveBeenCalledWith(
    'InitiateCheckout',
    expect.objectContaining({ content_name: 'PRO', currency: 'BRL', value: 99 }),
  );
});

it('cartão confirmado dispara Subscribe com o valor do plano', async () => {
  checkout.mockResolvedValue({ method: 'CREDIT_CARD', status: 'ACTIVE' });
  render(<AssinaturaPage />);
  fireEvent.click(screen.getByRole('button', { name: /assinar essencial/i }));
  fireEvent.click(screen.getByRole('button', { name: /cartão/i }));
  fireEvent.change(screen.getByLabelText(/nome no cartão/i), { target: { value: 'ANA' } });
  fireEvent.change(screen.getByLabelText(/número do cartão/i), { target: { value: '4111111111111111' } });
  fireEvent.change(screen.getByLabelText(/validade/i), { target: { value: '12/2030' } });
  fireEvent.change(screen.getByLabelText(/cvv/i), { target: { value: '123' } });
  fireEvent.change(screen.getByLabelText(/^cpf$/i), { target: { value: '12345678901' } });
  fireEvent.change(screen.getByLabelText(/cep/i), { target: { value: '01310100' } });
  fireEvent.change(screen.getByLabelText(/número \(endereço\)/i), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText(/telefone/i), { target: { value: '11999999999' } });
  fireEvent.click(screen.getByRole('button', { name: /pagar/i }));
  await waitFor(() => expect(checkout).toHaveBeenCalled());
  await waitFor(() =>
    expect(trackMetaEvent).toHaveBeenCalledWith(
      'Subscribe',
      expect.objectContaining({ content_name: 'ESSENCIAL', currency: 'BRL', value: 49 }),
    ),
  );
});

it('agendado: card mostra "sem cobrança agora" com a data de vigência', async () => {
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
  await waitFor(() => expect(screen.getByText(/sem cobrança agora/i)).toBeInTheDocument());
});
