import { describe, it, expect } from 'vitest';
import { imcCategory, formatImc } from './imc';

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
