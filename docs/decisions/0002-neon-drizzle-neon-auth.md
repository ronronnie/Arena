# 0002 — Neon over Supabase, and what replaces row-level security

- **Status:** Accepted
- **Date:** 2026-08-20
- **Context:** Prompt 0
- **Supersedes:** the Supabase line in the prompt pack's stack

## Context

The prompt pack specifies Supabase for Postgres, Auth, RLS, and Storage. During Prompt 0
the decision was made to use Neon instead.

Supabase was doing four separate jobs, and only one of them is a database:

1. Postgres — replaced by Neon.
2. Auth — replaced by Neon Auth (a hosted Better Auth instance).
3. Storage — replaced by Vercel Blob.
4. **Row-level security** — not replaced by anything equivalent.

Point 4 is the one that matters. Core rule 7 says users may be minors and requires strict
authorization on all personal data. Under Supabase that was a _database_ guarantee: a
policy on the table, enforced by Postgres, unbypassable by a forgotten `WHERE` clause in
application code. Neon supports RLS, but the idiomatic Neon + Drizzle pattern — and the
one chosen here — enforces authorization in application code instead.

**That is a downgrade in guarantee, chosen knowingly.** Writing it down is the point of
this ADR.

## Decision

**Neon Postgres + Drizzle ORM + Neon Auth + Vercel Blob**, with authorization
enforced by a guarded data-access layer.

The DAL is not a style preference. It is the thing standing in for RLS, so it is
designed to fail loudly rather than degrade quietly:

1. **One door.** `lib/db/client.ts` holds the only Drizzle instance. An ESLint
   `no-restricted-imports` rule makes it unreachable from `/app`, `/components`,
   `/inngest`, and the rest of `/lib`. Reaching for the database from a component is a
   build failure, not a code-review comment.

2. **No implicit current user.** Every function in `/lib/db/queries` takes an `Actor` as
   its first argument — `user`, `anonymous`, or `system`. The call site must state whose
   authority the query runs on. Most authorization bugs are the absence of a question;
   this makes the question unavoidable.

3. **The actor model is framework-free.** `lib/db/actor.ts` imports nothing from React or
   Next, so "who may read what" is unit-testable without a request in scope. `lib/auth`
   is the single place a session becomes an actor.

4. **`system()` requires a reason.** Trusted server work bypasses user-scoped checks and
   must say why in a string destined for the moderation audit log. It can never be
   constructed from a request.

5. **`isMinor` defaults to `true`.** Until onboarding collects a date of birth (Prompt 3),
   the safe default is the restrictive one. A wrong guess here has a different cost in
   each direction, and only one of those directions is acceptable.

6. **Authorization gets its own tests.** Every query touching personal data needs a test
   proving the _wrong_ actor receives a `ForbiddenError`. Testing that the right actor
   gets the right row proves nothing about the guarantee we just gave up.

## Consequences

**Good**

- Authorization is ordinary, readable, testable TypeScript rather than SQL policies that
  are hard to unit-test and easy to get subtly wrong.
- Identity lives in our own Postgres (the `neon_auth` schema), so profile joins are SQL,
  not network calls.
- Neon branching gives preview deploys isolated databases.
- Drizzle keeps pairing and rating queries SQL-shaped, which will matter by Prompt 10.

**Costs — stated plainly**

- **A missing check is now a data leak.** Under RLS, forgetting a filter returned zero
  rows. Under a DAL, it returns everyone's. The ESLint guard and the actor-first
  signature exist because of this, and they are load-bearing.
- Every new query is an opportunity to get it wrong. This does not scale on discipline
  alone; it scales on the guard rails staying in place. Do not add exceptions.
- Direct SQL access (Drizzle Studio, psql, a future admin tool) has no authorization at
  all. Treat production credentials accordingly.
- Neon's HTTP driver has no interactive transactions. Season rollover and batch rating
  writes will need the pooled WebSocket driver.

**Revisit if**

- A single authorization bug reaches production, or a review finds a query that skipped
  the DAL. Either is sufficient evidence that discipline is not enough, and the answer is
  Neon RLS with JWT-scoped policies keyed off the Stack session — a real migration, but a
  known one.
- Compliance ever requires a demonstrable database-level guarantee for minors' data.

## Note for future prompts

Later prompts in the pack say "Supabase", "RLS policy", "Supabase Storage". Read those as:

| Prompt says           | Do this instead                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| Supabase client       | `@/lib/db` (never `lib/db/client` directly)                                                        |
| RLS policy on table X | Authorization in the `/lib/db/queries` function for X, plus a test that the wrong actor is refused |
| Supabase Auth         | Neon Auth (Stack), via `lib/auth`                                                                  |
| Supabase Storage      | Vercel Blob (avatars, thumbnails, cards) or Mux (performance video)                                |
| `supabase/migrations` | `/drizzle`, generated by `npm run db:generate`                                                     |

---

## Correction — 2026-08-20, same session

The first draft of this ADR said Neon Auth was **Stack Auth** and that identity arrived in
a `neon_auth.users_sync` table. That was wrong, and it was wrong in code too:
`@stackframe/stack` was installed and wired before the database was inspected.

Enabling Auth on the Neon project settled it. The `neon_auth` schema contains `user`,
`session`, `account`, `verification`, `jwks`, `organization`, `member`, `invitation` —
Better Auth's schema, with the admin and organization plugins. There is no `users_sync`
table. Neon Auth is now a **hosted Better Auth instance**, and the JWKS endpoint serves an
Ed25519 key.

What changed as a result:

- `@stackframe/stack` removed; `@neondatabase/auth` (0.5.0-beta) installed.
- `lib/auth/stack.ts` and `app/handler/[...stack]/` deleted; replaced by `lib/auth/index.ts`,
  `lib/auth/client.ts`, `lib/auth/env.ts`, and `app/api/auth/[...path]/route.ts`.
- Next upgraded 15 → 16, because the SDK requires it. See [0003](./0003-next-16.md).
- Env vars changed from three Stack keys to `NEON_AUTH_BASE_URL` and
  `NEON_AUTH_COOKIE_SECRET`.

**The lesson worth keeping:** the vendor's product name stayed the same while the thing
underneath it was replaced. Inspecting the actual schema took one query and would have
caught it before any code was written. Do that first next time.

`@neondatabase/auth` is **0.5.0-beta**. That is a real risk on a load-bearing dependency
and is accepted for now because it is the official SDK and the underlying Better Auth
protocol is stable. If the SDK proves unstable, the fallback is the `better-auth` client
(1.7.1) pointed at the same base URL — the hosted server speaks standard Better Auth, as
the `/api/auth/ok` and `/api/auth/sign-up/email` round trips confirmed.
