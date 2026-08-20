/**
 * Environment access for the database layer.
 *
 * Fails loudly at call time rather than handing the driver an `undefined` connection
 * string and letting it surface three layers deeper as something unreadable.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/** Pooled Neon connection. What the app uses for everything. */
export function databaseUrl(): string {
  return required('DATABASE_URL', process.env.DATABASE_URL);
}

/**
 * Direct (unpooled) Neon connection. Migrations and long transactions only —
 * drizzle-kit cannot run DDL through the pooler.
 */
export function directDatabaseUrl(): string {
  return process.env.DATABASE_URL_UNPOOLED ?? databaseUrl();
}
