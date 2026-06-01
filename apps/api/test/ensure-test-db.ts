import { Client } from 'pg';

const TEST_DB = 'nutri_plus_test';
const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ??
  'postgresql://postgres:1234@localhost:5432/postgres';

export async function ensureTestDatabase(): Promise<void> {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [TEST_DB],
    );
    // rowCount is `number | null` in @types/pg; treat null/0 as "not found".
    if (!rowCount) {
      // Identifier is a constant, not user input — safe to interpolate.
      await client.query(`CREATE DATABASE ${TEST_DB}`);
    }
  } finally {
    await client.end();
  }
}
