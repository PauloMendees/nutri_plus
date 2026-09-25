import { describe, it, expect } from 'vitest';
import { maskPhoneBr, maskWhatsappNational } from './phone';

describe('maskPhoneBr', () => {
  it.each([
    ['', ''],
    ['1', '(1'],
    ['11', '(11'],
    ['119', '(11) 9'],
    ['1199999', '(11) 99999'],
    ['1133334444', '(11) 3333-4444'],
    ['11999998888', '(11) 99999-8888'],
  ])('masks %j as %j', (input, expected) => {
    expect(maskPhoneBr(input)).toBe(expected);
  });

  it('drops non-digits and anything past 11 digits', () => {
    expect(maskPhoneBr('+55 (11) 99999-88889')).toBe('(55) 11999-9988');
    expect(maskPhoneBr('11a99999b8888 77')).toBe('(11) 99999-8888');
  });

  it('is idempotent on an already masked value', () => {
    expect(maskPhoneBr('(11) 99999-8888')).toBe('(11) 99999-8888');
  });
});

describe('maskWhatsappNational', () => {
  it('uses the Brazilian mask for +55', () => {
    expect(maskWhatsappNational('11999998888', '+55')).toBe('(11) 99999-8888');
  });

  it('keeps only digits for other country codes, up to the E.164 limit', () => {
    expect(maskWhatsappNational('(202) 555-0123', '+1')).toBe('2025550123');
    expect(maskWhatsappNational('12345678901234567', '+1')).toBe('12345678901234');
    expect(maskWhatsappNational('12345678901234567', '+351')).toBe('123456789012');
  });
});
