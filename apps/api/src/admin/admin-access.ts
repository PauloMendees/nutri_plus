// Allowlist do painel de administradores (env ADMIN_EMAILS, separada por
// vírgula). Ausente ou vazia ⇒ ninguém é admin: o padrão seguro.
export function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined, raw: string | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).has(email.trim().toLowerCase());
}
