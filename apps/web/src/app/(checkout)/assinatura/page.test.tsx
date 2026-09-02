import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { checkoutValue } from '@/lib/analytics/meta-events';

const startTrial = vi.fn();
const checkout = vi.fn();
const changePlan = vi.fn();
const previewChangePlan = vi.fn();
const trackConversion = vi.fn();
// checkoutValue continua real (puro sobre o PLAN_CATALOG); reimplementá-lo aqui
// faria as asserções compararem o mock contra ele mesmo.
vi.mock('@/lib/analytics/meta-conversions', () => ({
  trackConversion: (...a: unknown[]) => trackConversion(...a),
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
  // Conta nova: nunca fez trial, nunca pagou -> elegível.
  useQuery.mockReturnValue({ data: { onboardedAt: null, canStartTrial: true, status: 'TRIALING', entitlements: { isReadOnly: true } } });
  currentSearchParams = new URLSearchParams();
  trackConversion.mockReset();
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
  expect(trackConversion).toHaveBeenCalledWith('StartTrial', { params: { value: 0, currency: 'BRL' } });
});

it('não dispara StartTrial quando o trial falha', async () => {
  startTrial.mockRejectedValue(new Error('nope'));
  render(<AssinaturaPage />);
  fireEvent.click(screen.getByRole('button', { name: /começar teste grátis/i }));
  await waitFor(() => expect(startTrial).toHaveBeenCalled());
  expect(replace).not.toHaveBeenCalled();
  expect(trackConversion).not.toHaveBeenCalledWith('StartTrial', expect.anything());
});

it('escolher plano + Pix mostra o QR', async () => {
  checkout.mockResolvedValue({ method: 'PIX', pixQrCode: { encodedImage: 'B64', payload: 'p' } });
  render(<AssinaturaPage />);
  fireEvent.click(screen.getAllByRole('button', { name: /assinar/i })[0]);
  fireEvent.click(screen.getByRole('button', { name: /^pix$/i }));
  fireEvent.change(screen.getByLabelText(/cpf\/cnpj/i), { target: { value: '123.456.789-01' } });
  fireEvent.click(screen.getByRole('button', { name: /gerar código pix/i }));
  await waitFor(() => expect(screen.getByAltText(/qr code pix/i)).toBeInTheDocument());
  expect(trackConversion).toHaveBeenCalledWith(
    'InitiateCheckout',
    expect.objectContaining({
      params: expect.objectContaining({ content_name: 'ESSENCIAL', currency: 'BRL', value: checkoutValue('ESSENCIAL', 'MONTHLY') }),
      // plan/period vão para o relay: o servidor recalcula o valor pelo catálogo.
      plan: 'ESSENCIAL',
      period: 'MONTHLY',
    }),
  );
});

it('input de CPF/CNPJ formata enquanto se digita e envia só os dígitos', async () => {
  checkout.mockResolvedValue({ method: 'PIX', pixQrCode: { encodedImage: 'B64', payload: 'p' } });
  render(<AssinaturaPage />);
  fireEvent.click(screen.getAllByRole('button', { name: /assinar/i })[0]);
  fireEvent.click(screen.getByRole('button', { name: /^pix$/i }));

  const input = screen.getByLabelText(/cpf\/cnpj/i) as HTMLInputElement;
  // Digitação crua, sem separadores — o que o usuário realmente faz.
  fireEvent.change(input, { target: { value: '70791944158' } });
  expect(input.value).toBe('707.919.441-58');

  fireEvent.click(screen.getByRole('button', { name: /gerar código pix/i }));
  await waitFor(() => expect(checkout).toHaveBeenCalled());
  // A API exige ^\d{11}$: a máscara não pode vazar no payload.
  expect(checkout).toHaveBeenCalledWith(expect.objectContaining({ cpfCnpj: '70791944158' }));
});

it('input de CPF/CNPJ não trunca CNPJ em 11 dígitos', () => {
  render(<AssinaturaPage />);
  fireEvent.click(screen.getAllByRole('button', { name: /assinar/i })[0]);
  fireEvent.click(screen.getByRole('button', { name: /^pix$/i }));

  const input = screen.getByLabelText(/cpf\/cnpj/i) as HTMLInputElement;
  fireEvent.change(input, { target: { value: '12345678901234' } });
  expect(input.value).toBe('12.345.678/9012-34');
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
  expect(trackConversion).toHaveBeenCalledWith(
    'InitiateCheckout',
    expect.objectContaining({
      params: expect.objectContaining({ content_name: 'PRO', currency: 'BRL', value: checkoutValue('PRO', 'MONTHLY') }),
      plan: 'PRO',
      period: 'MONTHLY',
    }),
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
    expect(trackConversion).toHaveBeenCalledWith(
      'Subscribe',
      expect.objectContaining({
        params: expect.objectContaining({ content_name: 'ESSENCIAL', currency: 'BRL', value: checkoutValue('ESSENCIAL', 'MONTHLY') }),
        plan: 'ESSENCIAL',
        period: 'MONTHLY',
      }),
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

it('mostra o botão de trial quando canStartTrial, mesmo com onboardedAt marcado', () => {
  // Cenário do bug: checkout abandonado (Pix gerado, não pago) marca
  // onboardedAt. O botão precisa continuar disponível.
  useQuery.mockReturnValue({
    data: {
      onboardedAt: '2026-08-27T00:33:39Z',
      canStartTrial: true,
      status: 'TRIALING',
      entitlements: { isReadOnly: true },
    },
  });
  render(<AssinaturaPage />);
  expect(screen.getByRole('button', { name: /teste grátis/i })).toBeInTheDocument();
});

it('esconde o botão de trial quando canStartTrial é false', () => {
  useQuery.mockReturnValue({
    data: {
      onboardedAt: null,
      canStartTrial: false,
      status: 'TRIALING',
      entitlements: { isReadOnly: true },
    },
  });
  render(<AssinaturaPage />);
  expect(screen.queryByRole('button', { name: /teste grátis/i })).not.toBeInTheDocument();
});

it('com o QR do Pix na tela ainda dá para voltar (o usuário não fica preso)', async () => {
  checkout.mockResolvedValue({ method: 'PIX', pixQrCode: { encodedImage: 'B64', payload: 'p' } });
  render(<AssinaturaPage />);
  fireEvent.click(screen.getAllByRole('button', { name: /assinar/i })[0]);
  fireEvent.click(screen.getByRole('button', { name: /^pix$/i }));
  fireEvent.change(screen.getByLabelText(/cpf\/cnpj/i), { target: { value: '70791944158' } });
  fireEvent.click(screen.getByRole('button', { name: /gerar código pix/i }));
  await waitFor(() => expect(screen.getByAltText(/qr code pix/i)).toBeInTheDocument());

  // O botão precisa existir JUNTO com o QR — era aqui que ele desaparecia.
  const voltar = screen.getByRole('button', { name: /voltar/i });
  fireEvent.click(voltar);

  // Volta para o seletor de planos, sem QR.
  expect(screen.queryByAltText(/qr code pix/i)).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /assinar/i }).length).toBeGreaterThan(0);
});

it('upgrade por Pix: com o QR na tela ainda dá para voltar', async () => {
  previewChangePlan.mockResolvedValue({ kind: 'UPGRADE', amountNow: 25, recurringValue: 99, recurringPeriod: 'MONTHLY', effectiveDate: '2026-08-20T00:00:00Z' });
  changePlan.mockResolvedValue({ kind: 'UPGRADE', method: 'PIX', pixQrCode: { encodedImage: 'B64', payload: 'p' }, amount: 25 });
  useQuery.mockReturnValue({
    data: {
      status: 'ACTIVE',
      plan: 'ESSENCIAL',
      billingPeriod: 'MONTHLY',
      paymentMethod: 'PIX',
      onboardedAt: '2026-08-01T00:00:00Z',
      entitlements: { isReadOnly: false },
    },
  });
  render(<AssinaturaPage />);
  fireEvent.click(await screen.findByRole('button', { name: /trocar para pro/i }));
  await waitFor(() => expect(screen.getByAltText(/qr code pix/i)).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /voltar/i }));

  // Volta para o picker de troca de plano, sem QR.
  expect(screen.queryByAltText(/qr code pix/i)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /trocar para pro/i })).toBeInTheDocument();
});
