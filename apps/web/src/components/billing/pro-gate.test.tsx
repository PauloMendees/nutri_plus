import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const useSubscription = vi.fn();
vi.mock('@/lib/queries/subscription', () => ({ useSubscription: () => useSubscription() }));
const emit = vi.fn();
vi.mock('@/lib/billing/billing-events', () => ({ emitBilling: (...a: any[]) => emit(...a) }));

import { ProGate } from './pro-gate';

it('libera o conteúdo quando a feature está disponível', () => {
  useSubscription.mockReturnValue({ data: { entitlements: { features: { silhueta: true } } } });
  render(<ProGate feature="silhueta"><button>Silhueta</button></ProGate>);
  expect(screen.getByText('Silhueta')).toBeEnabled();
});

it('bloqueia (lock) e emite upsell no clique quando indisponível', () => {
  useSubscription.mockReturnValue({ data: { entitlements: { features: { silhueta: false } } } });
  render(<ProGate feature="silhueta"><button>Silhueta</button></ProGate>);
  fireEvent.click(screen.getByRole('button'));
  expect(emit).toHaveBeenCalledWith('FEATURE_PRO_ONLY', 'silhueta');
});
