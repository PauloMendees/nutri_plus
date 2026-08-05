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
vi.mock('@tanstack/react-query', () => ({ useQuery: () => useQuery() }));
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: replace }) }));

import AssinaturaPage from './page';

beforeEach(() => {
  startTrial.mockReset().mockResolvedValue({ ok: true });
  checkout.mockReset();
  replace.mockClear();
  useQuery.mockReturnValue({ data: { onboardedAt: null, status: 'TRIALING', entitlements: { isReadOnly: true } } });
});

it('no onboarding mostra "Começar teste grátis" e inicia o trial', async () => {
  render(<AssinaturaPage />);
  fireEvent.click(screen.getByRole('button', { name: /começar teste grátis/i }));
  await waitFor(() => expect(startTrial).toHaveBeenCalled());
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
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
