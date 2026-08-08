export const SUPPORT_CATEGORIES = [
  'BILLING',
  'LOGIN',
  'SUBSCRIPTION',
  'BUG',
  'SUGGESTION',
  'OTHER',
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  BILLING: 'Pagamento / cobrança',
  LOGIN: 'Problemas para entrar / conta',
  SUBSCRIPTION: 'Assinatura / planos',
  BUG: 'Bug / erro no sistema',
  SUGGESTION: 'Sugestão',
  OTHER: 'Outros',
};

export interface SupportRequest {
  replyTo: string;
  category: SupportCategory;
  description: string;
}

export interface SupportResponse {
  ok: true;
}
