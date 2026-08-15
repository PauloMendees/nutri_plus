import type { FeedbackSource } from '@nutri-plus/shared-types';

export function buildFeedbackEmail(input: {
  rating: number;
  comment: string | null;
  source: FeedbackSource;
  user: { id: string; name: string; email: string; role: string };
  sentAt: Date;
}): { subject: string; text: string } {
  const subject = `[iNutri Feedback] ${input.rating}/5 — ${input.user.name}`;
  const text = [
    `Nota: ${input.rating}/5`,
    `Comentário: ${input.comment ?? '—'}`,
    `Origem: ${input.source}`,
    `Usuário: ${input.user.name} <${input.user.email}>`,
    `Role: ${input.user.role}`,
    `User ID: ${input.user.id}`,
    `Enviado em: ${input.sentAt.toISOString()}`,
  ].join('\n');
  return { subject, text };
}
