import { canonicalizeWhatsappNumber, whatsappMeUrl } from '@nutri-plus/shared-types';

describe('canonicalizeWhatsappNumber', () => {
  it('returns null for empty / null / non-digits-only blank', () => {
    expect(canonicalizeWhatsappNumber(null)).toBeNull();
    expect(canonicalizeWhatsappNumber(undefined)).toBeNull();
    expect(canonicalizeWhatsappNumber('')).toBeNull();
    expect(canonicalizeWhatsappNumber('   ')).toBeNull();
    expect(canonicalizeWhatsappNumber('( )')).toBeNull();
  });

  it('prepends 55 to 10 or 11 digit DDD numbers', () => {
    expect(canonicalizeWhatsappNumber('11999998888')).toBe('5511999998888');
    expect(canonicalizeWhatsappNumber('11 99999-8888')).toBe('5511999998888');
    expect(canonicalizeWhatsappNumber('1199998888')).toBe('551199998888');
  });

  it('keeps 12–13 digit numbers that already start with 55', () => {
    expect(canonicalizeWhatsappNumber('5511999998888')).toBe('5511999998888');
    expect(canonicalizeWhatsappNumber('+55 11 99999-8888')).toBe('5511999998888');
  });

  it('keeps other 12–15 digit strings as-is', () => {
    expect(canonicalizeWhatsappNumber('141555526710')).toBe('141555526710');
  });

  it('throws on too-short or too-long digit strings', () => {
    expect(() => canonicalizeWhatsappNumber('12345')).toThrow();
    expect(() => canonicalizeWhatsappNumber('1'.repeat(16))).toThrow();
  });

  it('builds wa.me from canonical digits', () => {
    expect(whatsappMeUrl('5511999998888')).toBe('https://wa.me/5511999998888');
  });
});
