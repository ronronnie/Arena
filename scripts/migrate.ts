/**
 * Apply migrations.
 *
 * This exists because `drizzle-kit migrate` hangs indefinitely against Neon — it connects,
 * reports "Using 'pg' driver for database querying", and then spins without applying
 * anything or timing out. Rather than leave the project with a migration command that
 * silently does nothing, we drive Drizzle's own migrator directly. Same journal, same
 * `drizzle/` folder, same ordering; only the runner differs.
 *
 * Uses the UNPOOLED connection: DDL cannot run through Neon's pooler.
 */

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

config({ path: ['.env.local', '.env'], quiet: true });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Missing DATABASE_URL_UNPOOLED (or DATABASE_URL). Copy .env.example to .env.local.',
    );
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations applied.');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
