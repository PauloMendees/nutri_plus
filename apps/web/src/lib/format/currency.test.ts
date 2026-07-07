import { describe, expect, it } from 'vitest';
import { formatBRL, parseBRLToCents } from './currency';

const norm = (s: string) => s.replace(/\s/g, ' ');

describe('formatBRL', () => {
  it('formats cents as pt-BR BRL', () => {
    expect(norm(formatBRL(123456))).toBe(norm('R$ 1.234,56'));
    expect(norm(formatBRL(0))).toBe(norm('R$ 0,00'));
    expect(norm(formatBRL(-500))).toBe(norm('-R$ 5,00'));
  });
});

describe('parseBRLToCents', () => {
  it('parses pt-BR amounts to integer cents', () => {
    expect(parseBRLToCents('1.234,56')).toBe(123456);
    expect(parseBRLToCents('R$ 10,00')).toBe(1000);
    expect(parseBRLToCents('10')).toBe(1000);
    expect(parseBRLToCents('10,5')).toBe(1050);
  });

  it('returns NaN for empty/invalid input', () => {
    expect(Number.isNaN(parseBRLToCents(''))).toBe(true);
    expect(Number.isNaN(parseBRLToCents('abc'))).toBe(true);
  });
});
