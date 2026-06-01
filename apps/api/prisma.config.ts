import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 moves the connection URL out of schema.prisma. The CLI (migrate,
// studio, generate) reads it from here; the runtime PrismaClient gets it via
// the PrismaPg driver adapter (see src/prisma/prisma.service.ts).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
