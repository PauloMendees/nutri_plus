import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackMetaEvent, checkoutValue } from './meta-events';

beforeEach(() => {
  window.fbq = vi.fn();
});

describe('trackMetaEvent', () => {
  it('sends the standard event to fbq when the pixel is loaded', () => {
    trackMetaEvent('CompleteRegistration', { status: true });
    expect(window.fbq).toHaveBeenCalledWith('track', 'CompleteRegistration', { status: true });
  });

  it('does nothing when the pixel is not loaded', () => {
    delete window.fbq;
    expect(() => trackMetaEvent('StartTrial')).not.toThrow();
  });
});

describe('checkoutValue', () => {
  it('returns the catalog price for plan and period', () => {
    expect(checkoutValue('ESSENCIAL', 'MONTHLY')).toBe(49);
    expect(checkoutValue('PRO', 'YEARLY')).toBe(990);
  });
});
