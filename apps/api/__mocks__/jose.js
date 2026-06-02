// CJS shim for jose@6 used in Jest test environments.
//
// jose@6 is pure ESM; this shim implements only the functions that jwks-rsa@4 uses
// (importJWK, exportSPKI, decodeJwt, decodeProtectedHeader) via Node.js's built-in
// `crypto` module, which supports the same Web Crypto APIs.
//
// This shim is used in BOTH unit tests (where real crypto isn't called) and e2e tests
// (where real ES256 key import/export and JWT decoding is needed).
'use strict';

const crypto = require('crypto');

/**
 * Import a JWK into a CryptoKey (Web Crypto API, available in Node 18+).
 */
async function importJWK(jwk, alg) {
  const { ext, ...cleanJwk } = jwk;

  // Use the Web Crypto API available on the global `crypto` object in Node 18+.
  const keyUsages = cleanJwk.d ? ['sign'] : ['verify'];

  let importAlg;
  if (alg === 'ES256' || cleanJwk.crv === 'P-256') {
    importAlg = { name: 'ECDSA', namedCurve: 'P-256' };
  } else if (alg === 'ES384' || cleanJwk.crv === 'P-384') {
    importAlg = { name: 'ECDSA', namedCurve: 'P-384' };
  } else if (alg === 'ES512' || cleanJwk.crv === 'P-521') {
    importAlg = { name: 'ECDSA', namedCurve: 'P-521' };
  } else if (alg === 'RS256' || cleanJwk.kty === 'RSA') {
    importAlg = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  } else {
    throw new Error(`Unsupported algorithm: ${alg}`);
  }

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'jwk',
    cleanJwk,
    importAlg,
    true, // extractable
    keyUsages,
  );
  return cryptoKey;
}

/**
 * Export a CryptoKey (public) to SPKI PEM format.
 */
async function exportSPKI(key) {
  const spkiBuffer = await globalThis.crypto.subtle.exportKey('spki', key);
  const base64 = Buffer.from(spkiBuffer).toString('base64');
  const lines = base64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----\n`;
}

/**
 * Decode the JWT payload (base64url) without verification.
 */
function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(payload);
}

/**
 * Decode the JWT protected header (base64url) without verification.
 */
function decodeProtectedHeader(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const header = Buffer.from(parts[0], 'base64url').toString('utf8');
  return JSON.parse(header);
}

module.exports = {
  importJWK,
  exportSPKI,
  decodeJwt,
  decodeProtectedHeader,
};
