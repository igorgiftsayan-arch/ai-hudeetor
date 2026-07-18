import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for Drizzle commands');
}

export default defineConfig({
  dialect: 'postgresql',
  migrations: { table: '__drizzle_migrations', schema: 'public' },
  out: './database/migrations',
  schema: './packages/backend/src/infrastructure/database/schema.ts',
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
  verbose: true,
});
