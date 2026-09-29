import { describe, it, expect } from 'vitest';
import { fmtElapsed } from './format';

describe('fmtElapsed', () => {
  it('usa mm:ss antes de uma hora', () => {
    expect(fmtElapsed(0)).toBe('00:00');
    expect(fmtElapsed(9)).toBe('00:09');
    expect(fmtElapsed(75)).toBe('01:15');
    expect(fmtElapsed(3599)).toBe('59:59');
  });

  it('passa a h:mm:ss a partir de uma hora', () => {
    expect(fmtElapsed(3600)).toBe('1:00:00');
    expect(fmtElapsed(3725)).toBe('1:02:05');
  });

  it('não quebra com entrada inválida', () => {
    expect(fmtElapsed(-5)).toBe('00:00');
    expect(fmtElapsed(12.7)).toBe('00:12');
  });
});
