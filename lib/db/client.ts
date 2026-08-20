import 'server-only';

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
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
 * and write goes through the data-access layer in ./dal.ts, which requires an explicit
 * actor. An ESLint rule fails the build if anything outside /lib/db imports this file.
 *
 * If you are reaching for `db` from a component, a page, or a route handler, add a
 * query to /lib/db/queries instead. That is not bureaucracy; it is the only thing
 * standing between a minor's data and a missing WHERE clause.
 */
export const db = drizzle(neon(databaseUrl()), { schema, casing: 'snake_case' });

export type Db = typeof db;
export { schema };
