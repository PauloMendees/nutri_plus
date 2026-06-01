import { randomInt } from 'crypto';

// Crockford base32 without ambiguous I, L, O, U.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateReferralCode(): string {
  let body = '';
  for (let i = 0; i < 5; i++) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `NUTRI-${body}`;
}
