import { execSync } from 'child_process';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ensureTestDatabase } from './ensure-test-db';

// Point the app at the test database for the whole suite.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:1234@localhost:5432/nutri_plus_test?schema=public';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.OPENAI_API_KEY = 'sk-test';

// Prisma 7 requires a driver adapter for the standalone truncation client.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

beforeAll(async () => {
  await ensureTestDatabase();
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
  });
});

beforeEach(async () => {
  // Order matters: children before parents (FK constraints).
  await prisma.mealItem.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.mealPlan.deleteMany();
  await prisma.bodyAssessment.deleteMany();
  await prisma.employeeProfile.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.nutritionistProfile.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
