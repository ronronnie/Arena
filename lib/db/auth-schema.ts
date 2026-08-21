/**
 * Neon Auth's tables, declared read-only.
 *
 * This lives in its own file, deliberately, and `drizzle.config.ts` does NOT point at it.
 * That separation is the whole reason the file exists: drizzle-kit generates migrations
 * from whatever tables it finds exported by the files in its `schema` setting, and it
 * cannot tell "declared so we can join to it" from "declared so we can create it". With
 * this table in `schema.ts`, `npm run db:generate` emitted
 * `CREATE TABLE "neon_auth"."user"` — a statement that would have collided with the live
 * table on the very first migration and, worse, describes a table we do not own.
 *
 * Neon Auth's hosted Better Auth instance owns everything in the `neon_auth` schema. We
 * read it and key off it. We never create, alter, insert into, or drop it from
 * application code. (`scripts/seed.ts` does insert fake users here, and says why.)
 *
 * The column names are Better Auth's own camelCase, so each is named explicitly — the
 * client's `casing: 'snake_case'` setting would otherwise go looking for `email_verified`.
 */

import { boolean, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const neonAuth = pgSchema('neon_auth');

export const authUsers = neonAuth.table('user', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  emailVerified: boolean('emailVerified').notNull(),
  image: text('image'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
  role: text('role'),
  banned: boolean('banned'),
  banReason: text('banReason'),
  banExpires: timestamp('banExpires', { withTimezone: true }),
});
