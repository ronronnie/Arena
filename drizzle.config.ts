import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// `dotenv/config` only reads `.env`, which this project does not have — the working
// credentials live in `.env.local`. Loading it explicitly, local first.
config({ path: ['.env.local', '.env'], quiet: true });

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  /*
   * We manage `public` and nothing else. The `neon_auth` schema belongs to Neon Auth's
   * hosted Better Auth instance — we declare `neon_auth.user` in schema.ts so profiles can
   * key off it, but without this filter drizzle-kit reads that declaration as an intent to
   * create the table and emits `CREATE TABLE "neon_auth"."user"`, which would collide with
   * the live one on the first migration.
   */
  schemaFilter: ['public'],
  dbCredentials: {
    // DDL cannot run through Neon's pooler; use the unpooled connection for migrations.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
