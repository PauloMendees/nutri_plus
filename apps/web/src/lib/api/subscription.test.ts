import { describe, it, expect, vi, beforeEach } from 'vitest';
const fetchMock = vi.fn();
vi.mock('@/lib/api/browser', () => ({ browserApiFetch: (...a: any[]) => fetchMock(...a) }));
import { startTrial, updatePaymentMethod, checkoutSubscription } from './subscription';

beforeEach(() => { fetchMock.mockReset().mockResolvedValue({ ok: true }); });

describe('subscription api', () => {
  it('startTrial → POST /me/subscription/start-trial', async () => {
    await startTrial();
    expect(fetchMock).toHaveBeenCalledWith('/me/subscription/start-trial', { method: 'POST' });
  });
  it('updatePaymentMethod → POST /me/subscription/payment-method', async () => {
    await updatePaymentMethod({ method: 'PIX', cpfCnpj: '12345678901' } as any);
    expect(fetchMock).toHaveBeenCalledWith('/me/subscription/payment-method', { method: 'POST', body: { method: 'PIX', cpfCnpj: '12345678901' } });
  });
  it('checkoutSubscription → POST /me/subscription/checkout', async () => {
    await checkoutSubscription({ plan: 'PRO', period: 'MONTHLY', cpfCnpj: '12345678901', method: 'PIX' });
    expect(fetchMock).toHaveBeenCalledWith('/me/subscription/checkout', { method: 'POST', body: expect.objectContaining({ method: 'PIX' }) });
  });
});
