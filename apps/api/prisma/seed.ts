// Seeds the global Food catalog from the bundled TACO dataset
// (Tabela Brasileira de Composição de Alimentos — NEPA/UNICAMP).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { SeedFood } from '../src/foods/taco-mapper';

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
  });
  const foods = JSON.parse(
    readFileSync(join(__dirname, 'data', 'taco.json'), 'utf8'),
  ) as SeedFood[];
  if (foods.length < 500) throw new Error(`taco.json has < 500 foods (${foods.length})`);
  for (const f of foods) {
    await prisma.food.upsert({
      where: { tacoId: f.tacoId },
      update: f,
      create: f,
    });
  }
  const count = await prisma.food.count();
  if (count < 500) throw new Error(`Food count < 500 after seed (${count})`);
  console.log(`seeded ${count} foods`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
