import 'server-only';

import { neon } from '@neondatabase/serverless';
import { type NeonHttpDatabase, drizzle } from 'drizzle-orm/neon-http';
import { databaseUrl } from './env';
import * as schema from './schema';

/**
 * The raw Drizzle client.
 *
 * DO NOT IMPORT THIS OUTSIDE /lib/db.
 *
 * Core rule 7: users may be minors. We chose Neon over a database with row-level
 * security, which means the guarantee that a query cannot read data it shouldn't is no
 * longer enforced by Postgres — it is enforced by us, here, in one place. Every read
 * and write goes through the data-access layer in ./queries, which requires an explicit
 * actor. An ESLint rule fails the build if anything outside /lib/db imports this file.
 *
 * If you are reaching for `db` from a component, a page, or a route handler, add a
 * query to /lib/db/queries instead. That is not bureaucracy; it is the only thing
 * standing between a minor's data and a missing WHERE clause.
 */

let instance: NeonHttpDatabase<typeof schema> | undefined;

/**
 * Built on first query, not at import time.
 *
 * This matters more than it looks. `databaseUrl()` throws when DATABASE_URL is missing,
 * and a page that imports the data-access layer transitively imports this file — so
 * constructing eagerly made `next build` fail on any machine without credentials, which
 * includes CI and every preview build. Same reasoning as the lazy auth instance in
 * `lib/auth`: a missing credential should fail at the request that needed it, naming the
 * variable, rather than at import.
 */
function connection(): NeonHttpDatabase<typeof schema> {
  instance ??= drizzle(neon(databaseUrl()), { schema, casing: 'snake_case' });
  return instance;
}

export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, property) {
    const real = connection() as unknown as Record<string | symbol, unknown>;
    const value = real[property];
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

export type Db = NeonHttpDatabase<typeof schema>;
export { schema };
