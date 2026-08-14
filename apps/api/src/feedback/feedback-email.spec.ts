import { buildFeedbackEmail } from './feedback-email';

describe('buildFeedbackEmail', () => {
  it('monta subject e corpo com comentário', () => {
    const out = buildFeedbackEmail({
      rating: 4,
      comment: 'Gostei do plano',
      source: 'WEB',
      user: { id: 'u1', name: 'Ana', email: 'ana@x.com', role: 'NUTRITIONIST' },
      sentAt: new Date('2026-08-14T12:00:00.000Z'),
    });
    expect(out.subject).toBe('[iNutri Feedback] 4/5 — Ana');
    expect(out.text).toContain('Nota: 4/5');
    expect(out.text).toContain('Comentário: Gostei do plano');
    expect(out.text).toContain('Origem: WEB');
    expect(out.text).toContain('Ana <ana@x.com>');
    expect(out.text).toContain('Role: NUTRITIONIST');
    expect(out.text).toContain('User ID: u1');
    expect(out.text).toContain('2026-08-14T12:00:00.000Z');
  });

  it('comentário nulo vira em-dash', () => {
    const out = buildFeedbackEmail({
      rating: 2,
      comment: null,
      source: 'MOBILE',
      user: { id: 'u2', name: 'Bia', email: 'bia@x.com', role: 'PATIENT' },
      sentAt: new Date('2026-08-14T12:00:00.000Z'),
    });
    expect(out.text).toContain('Comentário: —');
    expect(out.subject).toBe('[iNutri Feedback] 2/5 — Bia');
  });
});
