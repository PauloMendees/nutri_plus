import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }), usePathname: () => '/' }));
const useSubscription = vi.fn();
vi.mock('@/lib/queries/subscription', () => ({ useSubscription: () => useSubscription() }));
import { OnboardingGate } from './onboarding-gate';

beforeEach(() => replace.mockClear());
it('redireciona pra /assinatura quando onboardedAt é null', () => {
  useSubscription.mockReturnValue({ data: { onboardedAt: null } });
  render(<OnboardingGate />);
  expect(replace).toHaveBeenCalledWith('/assinatura');
});
it('não redireciona quando já fez onboarding', () => {
  useSubscription.mockReturnValue({ data: { onboardedAt: '2026-08-01T00:00:00Z' } });
  render(<OnboardingGate />);
  expect(replace).not.toHaveBeenCalled();
});
