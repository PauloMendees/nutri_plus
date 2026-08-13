import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const checkout = vi.fn();
vi.mock('@/lib/api/subscription', () => ({ checkoutSubscription: (b: any) => checkout(b), getSubscription: vi.fn() }));
const useQuery = vi.fn();
vi.mock('@tanstack/react-query', () => ({ useQuery: () => useQuery() }));

import AssinaturaPage from './page';

beforeEach(() => { checkout.mockReset(); useQuery.mockReturnValue({ data: { status: 'TRIALING', entitlements: { isReadOnly: false } } }); });

describe('AssinaturaPage', () => {
  it('mostra os planos e faz checkout redirecionando ao invoiceUrl', async () => {
    checkout.mockResolvedValue({ invoiceUrl: 'https://asaas/inv/1' });
    const origin = { href: '' };
    vi.stubGlobal('location', origin as any);
    render(<AssinaturaPage />);
    fireEvent.click(screen.getAllByText(/Assinar/i)[0]);
    // preenche CPF e confirma
    fireEvent.change(screen.getByLabelText(/CPF/i), { target: { value: '123.456.789-01' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() => expect(checkout).toHaveBeenCalledWith(expect.objectContaining({ plan: 'ESSENCIAL', period: 'MONTHLY', cpfCnpj: '12345678901' })));
    await waitFor(() => expect(origin.href).toBe('https://asaas/inv/1'));
  });

  it('mostra sucesso quando a assinatura está ativa', () => {
    useQuery.mockReturnValue({ data: { status: 'ACTIVE', entitlements: { isReadOnly: false } } });
    render(<AssinaturaPage />);
    expect(screen.getByText(/assinatura ativa/i)).toBeInTheDocument();
  });

  it('em trial oferece continuar com o teste gratuito para a listagem de pacientes', () => {
    render(<AssinaturaPage />);
    const trial = screen.getByRole('link', { name: /continuar com o teste gratuito/i });
    expect(trial).toHaveAttribute('href', '/patients');
  });

  it('não oferece teste gratuito quando a conta está somente-leitura', () => {
    useQuery.mockReturnValue({ data: { status: 'TRIALING', entitlements: { isReadOnly: true } } });
    render(<AssinaturaPage />);
    expect(screen.queryByRole('link', { name: /continuar com o teste gratuito/i })).not.toBeInTheDocument();
  });
});
