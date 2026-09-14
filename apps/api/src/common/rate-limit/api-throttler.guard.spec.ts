import { jwtSubject } from './api-throttler.guard';

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}

describe('jwtSubject', () => {
  it('extrai o sub de um Bearer JWT sem verificar assinatura', () => {
    expect(jwtSubject(`Bearer ${fakeJwt({ sub: 'user-1' })}`)).toBe('user-1');
  });

  it('devolve undefined sem Bearer, com token malformado ou sem sub', () => {
    expect(jwtSubject(undefined)).toBeUndefined();
    expect(jwtSubject('Basic abc')).toBeUndefined();
    expect(jwtSubject('Bearer not-a-jwt')).toBeUndefined();
    expect(jwtSubject('Bearer a.b.c')).toBeUndefined();
    expect(jwtSubject(`Bearer ${fakeJwt({ email: 'x' })}`)).toBeUndefined();
  });
});
