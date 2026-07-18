import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl, max: 1 });

try {
  await pool.query('select 1');
  process.stdout.write('PostgreSQL connection is ready\n');
} finally {
  await pool.end();
}
