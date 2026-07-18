import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 moves the connection URL out of schema.prisma. The CLI (migrate,
// studio) reads it from here; the runtime PrismaClient gets it via the
// PrismaPg driver adapter (see src/prisma/prisma.service.ts).
//
// We read process.env directly (not the throwing `env()` helper) so that
// `prisma generate` — which needs no DB connection and runs in postinstall
// before `.env` may exist — never fails on a missing DATABASE_URL. Migrate
// commands still require it and fail clearly if it's unset.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
