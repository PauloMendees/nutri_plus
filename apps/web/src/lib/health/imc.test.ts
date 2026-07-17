import { describe, it, expect } from 'vitest';
import { imcCategory, formatImc, kgFromPercent } from './imc';

describe('imcCategory', () => {
  it('classifies by WHO bands', () => {
    expect(imcCategory(17)).toBe('Abaixo do peso');
    expect(imcCategory(22)).toBe('Peso normal');
    expect(imcCategory(27)).toBe('Sobrepeso');
    expect(imcCategory(31)).toBe('Obesidade');
  });
  it('uses inclusive lower bounds', () => {
    expect(imcCategory(18.5)).toBe('Peso normal');
    expect(imcCategory(25)).toBe('Sobrepeso');
    expect(imcCategory(30)).toBe('Obesidade');
  });
  it('returns null for null input', () => {
    expect(imcCategory(null)).toBeNull();
  });
});

describe('formatImc', () => {
  it('formats value + category with pt-BR decimal', () => {
    expect(formatImc(24.2)).toBe('24,2 · Peso normal');
  });
  it('returns an em dash for null', () => {
    expect(formatImc(null)).toBe('—');
  });
});

describe('kgFromPercent', () => {
  it('computes weight * pct / 100 rounded to 1 decimal', () => {
    expect(kgFromPercent(91, 10)).toBe(9.1);
  });
  it('returns null when weight or percent is missing', () => {
    expect(kgFromPercent(null, 10)).toBeNull();
    expect(kgFromPercent(91, null)).toBeNull();
  });
});
