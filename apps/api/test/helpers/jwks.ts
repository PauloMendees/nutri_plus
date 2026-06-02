import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';

const KID = 'test-es256-key';

// One ephemeral P-256 keypair for the whole suite.
const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});

const PRIVATE_PEM = privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;

function publicJwk(): Record<string, unknown> {
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  return { ...jwk, kid: KID, alg: 'ES256', use: 'sig' };
}

export interface JwksServer {
  url: string;
  close: () => Promise<void>;
}

// Serves /auth/v1/.well-known/jwks.json with the public key, mimicking Supabase.
export async function startJwksServer(): Promise<JwksServer> {
  const server = createServer((req, res) => {
    if (req.url === '/auth/v1/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [publicJwk()] }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

interface SignOptions {
  sub: string;
  email: string;
  name?: string;
}

// Signs an ES256 token shaped like a Supabase access token. iss/aud match what
// the strategy validates; SUPABASE_URL must already point at the JWKS server.
export function signSupabaseJwt({ sub, email, name }: SignOptions): string {
  const issuer = `${process.env.SUPABASE_URL}/auth/v1`;
  return jwt.sign(
    { email, user_metadata: name ? { name } : {} },
    PRIVATE_PEM,
    {
      algorithm: 'ES256',
      keyid: KID,
      subject: sub,
      audience: 'authenticated',
      issuer,
      expiresIn: '1h',
    },
  );
}
