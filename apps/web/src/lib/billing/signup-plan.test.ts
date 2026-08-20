import { describe, it, expect } from 'vitest';
import { parseSignupPlan } from './signup-plan';

describe('parseSignupPlan', () => {
  it('maps landing query values', () => {
    expect(parseSignupPlan('pro')).toBe('PRO');
    expect(parseSignupPlan('essencial')).toBe('ESSENCIAL');
  });

  it('ignores unknown or empty values', () => {
    expect(parseSignupPlan(null)).toBeNull();
    expect(parseSignupPlan('PRO')).toBeNull();
    expect(parseSignupPlan('yearly')).toBeNull();
  });
});
