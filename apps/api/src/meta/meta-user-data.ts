import { createHash } from 'node:crypto';

/**
 * Normalização e hashing do `user_data` da CAPI, no formato que o Meta exige:
 * minúsculo, sem espaços nas pontas, sem pontuação em nomes, e SHA-256 em tudo
 * que é identificador pessoal. `fbp`, `fbc`, IP e user agent NÃO são hasheados.
 */

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashEmail(email: string): string {
  return sha256(email.trim().toLowerCase());
}

/** Nomes: minúsculo, sem acento nem pontuação (o Meta compara a forma normalizada). */
export function hashName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '')
    .trim();
  return sha256(normalized);
}

/**
 * Quebra o nome cadastrado em primeiro/último. Títulos ("dra.", "dr.") são
 * descartados: entram como pontuação/ruído e derrubariam a correspondência.
 */
export function splitName(full: string): { first?: string; last?: string } {
  const TITLES = new Set(['dr', 'dra', 'drª', 'sr', 'sra', 'nutri']);
  const parts = full
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/\.$/, ''))
    .filter((p) => p.length > 0 && !TITLES.has(p.toLowerCase()));

  if (parts.length === 0) return {};
  if (parts.length === 1) return { first: parts[0] };
  return { first: parts[0], last: parts[parts.length - 1] };
}

export interface MetaIdentity {
  email?: string | null;
  name?: string | null;
  /** `User.id` — identificador estável, sem PII nova. */
  externalId?: string | null;
}

/** Monta o bloco `user_data` a partir da identidade + sinais do navegador. */
export function buildUserData(
  identity: MetaIdentity,
  browser: {
    fbp?: string;
    fbc?: string;
    clientIpAddress?: string;
    clientUserAgent?: string;
  },
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (identity.email) data.em = [hashEmail(identity.email)];
  if (identity.externalId) data.external_id = [sha256(identity.externalId)];

  if (identity.name) {
    const { first, last } = splitName(identity.name);
    if (first) data.fn = [hashName(first)];
    if (last) data.ln = [hashName(last)];
  }

  // O iNutri só opera no Brasil; constante, sem custo e sem dado novo do usuário.
  data.country = [sha256('br')];

  if (browser.fbp) data.fbp = browser.fbp;
  if (browser.fbc) data.fbc = browser.fbc;
  if (browser.clientIpAddress) data.client_ip_address = browser.clientIpAddress;
  if (browser.clientUserAgent) data.client_user_agent = browser.clientUserAgent;

  return data;
}
