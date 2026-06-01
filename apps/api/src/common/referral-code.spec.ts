import { generateReferralCode } from './referral-code';

describe('generateReferralCode', () => {
  it('matches NUTRI-XXXXX format (5 Crockford base32 chars)', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateReferralCode()).toMatch(
        /^NUTRI-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/,
      );
    }
  });

  it('excludes ambiguous characters I, L, O, U', () => {
    for (let i = 0; i < 200; i++) {
      const body = generateReferralCode().slice('NUTRI-'.length);
      expect(body).not.toMatch(/[ILOU]/);
    }
  });

  it('produces varied codes (not constant)', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateReferralCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
