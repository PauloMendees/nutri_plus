import type { PrismaClient } from '../generated/prisma/client';

// Idempotente: só cria para nutricionistas SEM assinatura. comp por e-mail → Pro permanente.
export async function seedCourtesySubscriptions(
  prisma: Pick<PrismaClient, 'nutritionistProfile' | 'subscription'>,
  compEmails: string[],
  days: number,
): Promise<{ created: number; comped: number }> {
  const compSet = new Set(compEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const nutris = await (prisma.nutritionistProfile as any).findMany({
    include: { subscription: true, user: { select: { email: true } } },
  });
  let created = 0;
  let comped = 0;
  for (const n of nutris) {
    if (n.subscription) continue;
    const isComp = compSet.has(String(n.user?.email ?? '').toLowerCase());
    await (prisma.subscription as any).create({
      data: {
        nutritionistId: n.id,
        status: 'TRIALING',
        isComp,
        trialEndsAt: new Date(Date.now() + days * 24 * 3600 * 1000),
      },
    });
    created++;
    if (isComp) comped++;
  }
  return { created, comped };
}
