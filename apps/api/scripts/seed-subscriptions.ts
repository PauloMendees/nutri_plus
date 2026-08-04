import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedCourtesySubscriptions } from '../src/billing/seed-subscriptions';
import { COURTESY_DAYS } from '../src/billing/plan-policy';

async function main() {
  // Prisma 7: the connection URL comes from the driver adapter, not the
  // schema (same as PrismaService) — the constructor requires it.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? '',
    }),
  });
  const compEmails = (process.env.COMP_NUTRITIONIST_EMAILS ?? '').split(',');
  try {
    const out = await seedCourtesySubscriptions(prisma, compEmails, COURTESY_DAYS);
    console.log(`Cortesia semeada: created=${out.created} comped=${out.comped}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
