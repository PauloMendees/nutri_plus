import { describe, it, expect } from 'vitest';
import { appointmentColor } from './colors';

describe('appointmentColor', () => {
  it('returns the category color when present', () => {
    expect(appointmentColor({ category: { id: 'c', name: 'x', color: '#3B82F6' } })).toBe('#3B82F6');
  });
  it('returns null when there is no category or no color', () => {
    expect(appointmentColor({ category: null })).toBeNull();
    expect(appointmentColor({ category: { id: 'c', name: 'x', color: null } })).toBeNull();
  });
});
