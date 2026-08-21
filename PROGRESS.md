# Progress Log

## Current state

**The domain model exists and is live.** 20 tables and 1 view in `public` on the Neon
database, two triggers, a data-access layer over them, and a seed that produces a drop you
can actually judge. There is still **no feature UI** — that starts at Prompt 2.

`npm run build`, `npm run check` and `npm run test:e2e` all pass. 52 unit and integration
tests, 2 Playwright smoke tests. The build succeeds with **no environment variables set**,
which was re-verified this session and had in fact regressed (see the fixes below).

What exists now, on top of the Prompt 0 scaffold:

- `lib/db/schema.ts` — the full domain model. Two lanes in two separate tables, a
  composite foreign key making cross-brief comparisons impossible, and CHECK constraints
  on every invariant that can be expressed as one.
- `drizzle/0000_real_king_bedlam.sql` + `drizzle/0001_triggers_and_blind_view.sql` —
  applied. The second is hand-written: the licence trigger, the no-self-vote trigger, and
  the `set_piece_entry_blind` view.
- `lib/db/queries/*` — 27 actor-first functions across profiles, briefs, entries,
  comparisons, ratings and follows, re-exported through `lib/db/index.ts`.
- `scripts/seed.ts` — 2 categories, 1 open season, 3 published briefs on licensed tracks,
  60 competitors, 120 eligible entries, 800 comparisons, 12 signature entries, 200 follows.
  Deterministic, and re-runnable.
- `public/fixtures/clip-01..08.mp4` — eight generated ~2KB clips, plus the ffmpeg script
  that makes them.
- `/` now reads the seeded drop through the DAL, proving the whole path end to end.

Still absent: the design language, every screen, auth-gated routing, Mux, Inngest,
Upstash, and any rating maths (`ratings` rows are seeded, not computed).

**The stack diverges from the prompt pack.** Supabase was replaced with Neon + Drizzle +
Neon Auth + Vercel Blob. This has real consequences for Core rule 7 — read
`/docs/decisions/0002-neon-drizzle-neon-auth.md` before writing a single query. Prompt 1
added a second divergence, on lane modelling: `/docs/decisions/0004-two-lanes-two-tables.md`.

## Next step

Run **Prompt 2 — Design language (before any feature UI)** from
`/docs/arena-prompt-pack-FINAL.md`.

It replaces the neutral token layer in `app/globals.css` wholesale, so it should happen
before any screen is built rather than after. Two things from this repo to carry into it:

- **Light is the default and dark is opt-in via a `.dark` class** — decided in Prompt 0,
  do not add a `prefers-color-scheme` auto-switch.
- **Each category gets its own accent ramp** (see the glossary entry for Category). Two
  categories exist in the seed — `bharatanatyam` and `metal-vocals` — so the ramp
  mechanism has something real to be tested against.

The placeholder markup on `/` is scaffolding, not design. Prompt 2 may replace all of it;
what must keep working is that it reads the drop through `@/lib/db` with an `anonymous()`
actor.

## Open questions

1. ~~**Neon credentials.**~~ **Resolved 2026-08-20.** `DATABASE_URL` and
   `DATABASE_URL_UNPOOLED` are set in `.env.local` (gitignored) and both verified
   connecting: `neondb` on PostgreSQL 18.6, `us-east-2`, user `neondb_owner`. The
   database is **empty** — only the `public` schema, zero tables.

   **Neon Auth is enabled and verified.** `NEON_AUTH_BASE_URL` is set and
   `NEON_AUTH_COOKIE_SECRET` was generated locally (32 bytes, base64url). A full
   sign-up → session → database round trip succeeded and the test user was cleaned up.
   Nothing auth-related is outstanding for Prompt 1.

2. ~~**Git remote.**~~ **Resolved 2026-08-21.** `origin` is
   `git@github.com:ronronnie/Arena.git` and `main` is pushed and tracking. The remote was
   given as an HTTPS URL but set to SSH: there are no HTTPS credentials on this machine
   and no `gh` CLI, while the existing SSH key already authenticates as `ronronnie`, the
   account that owns the repository. No CI is configured on it — see the gaps list.
3. **The prize question** — from the prompt pack's pre-work, still unanswered and not
   solvable in code: what does winning actually get someone in week one, legally, in the
   launch market? Contest rules, age minimums, tax, skill-vs-chance and GST in India.
   Blocks Phase 4; does not block Prompts 1–15.
4. **`isMinor` is hardcoded `true`** in `lib/auth/actor.ts`. Deliberate — the safe default
   until Prompt 3's onboarding collects a date of birth. Prompt 3 must replace it.

5. **`@neondatabase/auth` is `0.5.0-beta`.** A beta dependency on the auth path is a real
   risk. Accepted because it is the official SDK and the server speaks standard Better
   Auth — the fallback is the stable `better-auth` client (1.7.1) against the same base
   URL, which the round-trip test showed would work. Revisit at Prompt 21.
6. ~~**Storage of minors' dates of birth.**~~ **Resolved 2026-08-22.** `dob` is a column on
   `profiles`, not on `neon_auth.user` — we do not control Better Auth's columns. The
   related decision is that `is_minor` is **not** stored at all: it is derived from `dob`
   by `lib/domain/age.ts`, which treats an unknown date of birth as a minor. Reasoning in
   ADR 0004. Prompt 3 must collect `dob` at onboarding and Prompt 19 must decide how long
   we keep it.

7. **Ratings are seeded, not computed.** `ratings` and `rating_history` hold plausible
   numbers drawn from a normal distribution so leaderboards and divisions have shape. They
   do **not** derive from the 800 seeded comparisons. Prompt 10 makes them real; until it
   does, no number shown from those tables means anything, which matters because Core rule
   6 says every number must be explainable.

8. **`npm run test` now needs ~35 seconds** when `DATABASE_URL` is set, because the
   integration suite makes a few hundred round trips to Neon. It skips itself entirely
   without credentials. If this becomes annoying, the fix is a separate vitest project and
   a `test:integration` script rather than deleting the coverage.

## Completed

### Prompt 1 — Domain model, licensing gate, and a seed that works — 2026-08-22

**Files created/changed**

_Schema and migrations_

- `lib/db/schema.ts` — the domain model. 20 tables: profiles, categories, seasons, tracks,
  set_pieces, set_piece_entries, signature_entries, eligibility_checks, comparisons,
  ratings, rating_history, divisions, division_members, judge_scores, judge_calibration,
  season_results, follows, reports, moderation_actions, appeals. Plus a declaration of the
  `set_piece_entry_blind` view.
- `lib/db/auth-schema.ts` — **new file.** `neon_auth.user`, read-only. Split out of
  `schema.ts` because drizzle-kit generates migrations from whatever it finds exported
  there, and emitted `CREATE TABLE "neon_auth"."user"` — a statement that would have
  collided with the live table on the first migration.
- `drizzle/0000_real_king_bedlam.sql` — generated. Applied.
- `drizzle/0001_triggers_and_blind_view.sql` — hand-written custom migration. Applied.
- `lib/db/types.ts` — inferred row, insert and enum types, plus `BlindEntry` / `BlindPair`.
- `drizzle.config.ts` — loads `.env.local` explicitly, and `schemaFilter: ['public']`.

_Data access_

- `lib/db/queries/profiles.ts`, `setPieces.ts`, `entries.ts`, `comparisons.ts`,
  `ratings.ts`, `follows.ts` — 27 exported functions, actor first.
- `lib/db/index.ts` — the public door, now populated.
- `lib/db/client.ts` — the Drizzle instance is now built lazily behind a Proxy.
- `lib/domain/age.ts` — **new.** `isMinor` / `ageInYears`, framework-free.

_Seed and fixtures_

- `scripts/seed.ts` — the real seed, replacing the placeholder that threw.
- `scripts/make-fixtures.sh` + `public/fixtures/clip-01..08.mp4` — eight generated clips,
  ~2.3 KB each, 19 KB total.
- `scripts/migrate.ts` — **new.** `npm run db:migrate` now runs this.

_Tests_

- `tests/unit/dal-authorization.test.ts` — 20 refusal tests.
- `tests/unit/age.test.ts` — 12 tests.
- `tests/integration/constraints.test.ts` — 15 tests against a real Postgres.
- `vitest.config.mts` — includes `tests/integration/**`.

_App and docs_

- `app/page.tsx` — reads the seeded drop through the DAL.
- `app/api/auth/[...path]/route.ts` — handler resolved per request, not at module scope.
- `docs/decisions/0004-two-lanes-two-tables.md` — **new ADR.**
- `CLAUDE.md` — 7 new glossary terms; two command-comment corrections.

**Decisions made**

1. **Two entry tables instead of one `entries` table with a `lane` enum.** The pack
   specifies one table plus a CHECK. Core rule 1 asks for structural separation, and with
   one table the only thing keeping signature work out of the rating system is that every
   aggregate query in Prompts 9–13 remembers `WHERE lane = 'set_piece'`. Now a signature
   entry reaching a comparison is a foreign-key error. Full trade-offs — including the
   column duplication this costs — in ADR 0004.

2. **Core rule 3 is a database view.** `set_piece_entry_blind` has no `user_id` column at
   all, and the voting path reads it. Not filtered, not hidden: absent. The reveal is a
   separate call that refuses until a vote exists, and refuses the system actor too — the
   reveal belongs to the voter who earned it.

3. **"Same brief" is a foreign key, not a trigger.** A composite unique on
   `set_piece_entries (id, set_piece_id)` plus composite FKs from `comparisons` means
   Postgres rejects a cross-brief pair outright. Only the licence window and the
   no-self-vote rule need triggers, because only those need a lookup.

4. **`is_minor` is derived, never stored.** The pack lists it as a column. A stored flag is
   wrong the morning after a birthday, and an unknown date of birth must read as "minor".
   `lib/domain/age.ts` owns it.

5. **A `video_source` enum instead of nullable Mux columns.** Entries reference either a
   Mux playback ID or a committed fixture path, with a CHECK making the combination
   explicit. This is what lets Prompts 5–7 build the voting surface before Prompt 8 exists,
   without leaving a nullable column whose meaning has to be inferred.

6. **The seed does not go through the data-access layer.** It opens its own pooled `pg`
   connection and runs in one transaction. The DAL's HTTP driver does one round trip per
   statement and cannot roll back a partial seed. It is the only file outside `/lib/db`
   that talks to Postgres directly, and the reasoning is written at the top of it.

7. **The seed writes fake rows into `neon_auth.user`.** There is no other way to have 60
   competitors, since profiles are keyed to identities. Every seeded identity uses the
   reserved `@seed.arena.invalid` domain and is cleaned up by email match, so a real
   account created through sign-up is never touched.

8. **`npm run db:migrate` no longer uses drizzle-kit.** `drizzle-kit migrate` connects to
   Neon, prints "Using 'pg' driver for database querying", and then hangs indefinitely
   without applying anything or timing out. `scripts/migrate.ts` drives Drizzle's own
   migrator instead — same journal, same folder, same ordering.

9. **Seeded competitors are all adults.** Fake minors' data is still a habit, and the
   default should be the one we want to keep.

**Two things that were broken and are now fixed**

- **`npm run build` did not work without credentials**, despite Prompt 0 claiming it did.
  Two separate causes: `lib/db/client.ts` constructed the Drizzle client at module scope,
  and `app/api/auth/[...path]/route.ts` destructured `auth().handler()` at module scope,
  which defeated the lazy auth instance behind it. Both are now lazy. Re-verified by moving
  `.env.local` aside and building.
- **A dead ADR link in `lib/db/queries/README.md`** pointing at `0002-neon-drizzle-stack-auth.md`.

**Deferred / known gaps**

- **No rating maths.** Glicko-2 is Prompt 10. Seeded ratings are drawn from a distribution
  and do not derive from the seeded comparisons.
- **Pairing is uniform-random.** `nextBlindPair` picks any two eligible entries. Rating-aware
  pairing is Prompt 10; doing it now would mean tuning it against fabricated ratings.
- **`recordVote` is two statements, not one transaction.** Neon's HTTP driver has no
  interactive transactions. A crash between them costs a user one comparison of unlock
  progress. Prompt 14 moves this onto the pooled WebSocket driver.
- **No queries yet for** eligibility checks, judge scores, judge calibration, season
  results, reports, moderation actions, or appeals. The tables and their constraints exist;
  the prompts that own those surfaces (9, 13, 11, 15) write the queries.
- **`profiles.handle` has no format validation.** A unique index only. Prompt 3 owns
  handle rules at onboarding.
- **No `updated_at` triggers.** Callers set it. Fine while every write goes through the DAL.
- **The `requirements` jsonb is unvalidated.** Prompt 9's eligibility engine gives it a
  schema; until then it is a bag.

**How to verify it works**

```bash
npm run db:migrate    # applies 0000 and 0001
npm run db:seed       # prints the row counts it created
npm run check         # typecheck + lint + 52 tests
npm run dev           # / lists the seeded drop, read through the DAL
```

The database-level rules are the ones that still hold when somebody bypasses the app, so
they are worth checking directly. Both of these must fail — the first is the licence gate,
the second is Core rule 3:

```sql
UPDATE set_pieces SET track_id = NULL WHERE status = 'published';
-- ERROR: set piece <id> cannot be published: no track_id, so there is no licence to check

SELECT user_id FROM set_piece_entry_blind LIMIT 1;
-- ERROR: column "user_id" does not exist
```

Both were run against the live database and produced exactly those errors. Note there is
**no `psql` on this machine** — use `npm run db:studio`, or a throwaway script using the
`pg` client already in devDependencies. Easier still: `npm test` covers both, in
`tests/integration/constraints.test.ts`, which runs every test inside a transaction it
always rolls back.

### Prompt 0 — Project constitution — 2026-08-20

**Files created/changed**

_Constitution and session continuity_

- `CLAUDE.md` — product summary, all eight core rules, stack table, folder conventions,
  the data-access contract, commands, glossary (16 terms), and a "Starting a new session"
  protocol.
- `PROGRESS.md` — this file.
- `docs/decisions/0001-stack-choice.md` — the first ADR.
- `docs/decisions/0002-neon-drizzle-neon-auth.md` — the Supabase → Neon decision and,
  more importantly, what replaces row-level security. Includes a translation table for
  every later prompt that says "Supabase", plus a correction recording the Stack Auth
  mistake described below.
- `docs/decisions/0003-next-16.md` — the Next 15 → 16 upgrade and what it broke.
- `docs/arena-prompt-pack-FINAL.md` — the 22-prompt pack, moved into the repo so it is
  versioned alongside the work.

_Hypotheses_

- `lib/config/hypotheses.ts` — all eight tunables, each with what it is based on and what
  evidence would change it.
- `tests/unit/hypotheses.test.ts` — five invariant tests (promotion + relegation cannot
  exceed a division; promotion must outweigh relegation; the map stays complete).

_Data access_

- `lib/db/client.ts` — the single Drizzle instance, `server-only`, unreachable outside
  `/lib/db`.
- `lib/db/actor.ts` — framework-free actor model: `UserActor`, `AnonymousActor`,
  `SystemActor`, `ForbiddenError`, `requireUser`, `requireSelfOrSystem`.
- `lib/db/index.ts` — the public door. `lib/db/queries/README.md` — the contract every
  query must follow.
- `lib/db/env.ts`, `lib/db/schema.ts` (placeholder), `drizzle.config.ts`.

_Auth_

- `lib/auth/index.ts` — lazily constructed `createNeonAuth` instance.
- `lib/auth/env.ts` — `NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET`, with the 32-char
  check done here so the error names the variable.
- `lib/auth/client.ts` — the browser client, talking only to our own proxy.
- `lib/auth/actor.ts` — the only place a session becomes an `Actor`.
- `app/api/auth/[...path]/route.ts` — the proxy to the hosted Neon Auth instance.

_App and tooling_

- `app/layout.tsx`, `app/page.tsx`, `app/globals.css` — placeholder shell and token layer.
- `lib/ui/cn.ts`, `components.json` — shadcn/ui wiring (`new-york`, neutral, CSS vars).
- `tsconfig.json` — strict plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`, `noImplicitOverride`, `noFallthroughCasesInSwitch`.
- `eslint.config.mjs` — flat config (Next 16 native) + TypeScript + Prettier, plus the
  two boundary guards.
- `.prettierrc.json`, `.prettierignore`, `vitest.config.mts`, `tests/setup.ts`,
  `playwright.config.ts`, `tests/e2e/smoke.spec.ts`.
- `.env.example` — every variable the codebase will use, grouped and commented.
- `scripts/seed.ts` (throws by design), `inngest/README.md` (which function lands in
  which prompt).
- `package.json` — 20 scripts including `npm run check`.

**Decisions made**

1. **Supabase → Neon + Drizzle + Neon Auth + Vercel Blob.** User's call, made
   mid-session. Full reasoning in ADR 0002.

   **Corrected later in the same session:** the auth layer was first built against
   `@stackframe/stack`, because older Neon Auth was Stack-based. It is not any more.
   Enabling Auth on the project and inspecting the schema showed Better Auth's tables
   (`user`, `session`, `account`, `verification`, `jwks`, `organization`, `member`,
   `invitation`) — no `users_sync` anywhere. Stack was removed and `@neondatabase/auth`
   installed. The lesson, recorded in ADR 0002: the vendor kept the product name while
   replacing what sits underneath it, and one query against the live schema would have
   caught it before any code was written.

2. **A guarded data-access layer replaces RLS.** This is the consequential one. Postgres
   no longer enforces isolation, so we do: one Drizzle instance behind an ESLint import
   ban, every query taking an explicit `Actor` first, `system()` requiring a stated
   reason, and refusal tests required for anything personal. Under RLS a missing filter
   returned zero rows; under a DAL it returns everyone's. The guard rails are load-bearing
   — do not add exceptions to them.
3. **Two ESLint boundaries instead of conventions.** `/lib` cannot import React or Next
   (domain logic stays testable without a browser), and nothing outside `/lib/db` can
   import the Drizzle client. Both were verified to actually fail before being written up.
4. **Hard-strict TypeScript.** `exactOptionalPropertyTypes` and `verbatimModuleSyntax`
   cause some friction (they already forced a fix in `playwright.config.ts`), taken
   deliberately: Core rules 6 and 7 are easier to hold when the compiler refuses to let
   `undefined` through.
5. **Lazy auth construction.** The Neon Auth instance is built on first use, not at module scope,
   so a missing credential fails at request time rather than breaking every CI and preview
   build. Same principle as `lib/db/env.ts`.
6. **`isMinor` defaults to `true`.** A wrong guess has asymmetric cost and only one
   direction is acceptable.
7. **Light theme default, no `prefers-color-scheme` auto-switch.** Dark is opt-in via a
   `.dark` class. From the design direction: older users overwhelmingly prefer light.
8. **Next 15 → 16**, against the prompt pack's pin. Forced by `@neondatabase/auth`'s
   `next >= 16` peer dependency, and it also cleared the three high-severity advisories
   whose only fix was Next 16. Taken now because the app was three files of placeholder
   UI; the same upgrade at Prompt 15 would be a project. ADR 0003. Knock-on: ESLint moved
   to native flat config and `@eslint/eslintrc` was removed.

9. **Playwright runs the mobile viewport project first, on port 3100.** Mobile is the
   primary target, not an afterthought. The dedicated port exists because
   `reuseExistingServer` silently attached to an unrelated project's dev server on 3000
   and the failure looked like a broken assertion.

**Deferred / known gaps**

- **No database schema, no queries, no migrations, no working seed.** All Prompt 1.
- ~~**No credentials anywhere.**~~ **Resolved later in the same session.** Neon and Neon
  Auth are both connected and verified — see **Current state** and open question 1.
  `.env.local` (gitignored) holds the working config; `.env.example` remains the
  documentation of every variable.
- **`lib/db/schema.ts` is empty**, so `lib/db/client.ts` is typed against nothing. It will
  start earning its keep in Prompt 1.
- **No shadcn/ui components installed yet.** `components.json` and `cn` are wired; the
  first component arrives with the first UI that needs it. The token layer in
  `globals.css` is neutral scaffolding and Prompt 2 replaces it wholesale.
- **Not installed, deliberately:** Mux, Inngest, Upstash, PostHog, Sentry. Each arrives
  with the prompt that uses it, so we don't carry unused dependencies through five phases.
  All are documented in `.env.example` and `CLAUDE.md` already.
- **No middleware and no sign-in UI.** `@neondatabase/auth` provides `auth.middleware()`
  for route protection, deliberately not mounted — with no protected routes yet it would
  be guessing at Prompt 3's design. Auth-gated routing and audience-first onboarding are
  Prompt 3.
- **No CI.** No GitHub Actions workflow. `npm run check` is the local gate.
- ~~3 high-severity npm advisories~~ **cleared by the Next 16 upgrade.** Four _moderate_
  advisories remain, all inside `drizzle-kit` via `@esbuild-kit/esm-loader` — a dev-only
  dependency that never ships. Revisit at Prompt 21 (hardening).
- **`@neondatabase/auth` is a beta release** on the auth path. See open question 5.
- **No PWA manifest or service worker** despite "web-first PWA". Not needed until there
  is something to install.

**How to verify it works**

```bash
npm install
npm run check         # typecheck + lint + 5 unit tests — all pass
npm run build         # succeeds with NO environment variables set
npm run test:e2e      # 2 smoke tests, mobile + desktop, on port 3100
```

Then verify the guard rails are real, because they are the substitute for RLS:

```bash
# Should FAIL with "Do not touch the database directly."
echo "import { db } from '@/lib/db/client'; export const x = db;" > app/_check.ts
npx eslint app/_check.ts; rm app/_check.ts

# Should FAIL with "/lib is framework-free."
echo "import { useState } from 'react'; export const y = useState;" > lib/domain/_check.ts
npx eslint lib/domain/_check.ts; rm lib/domain/_check.ts
```

Both were confirmed failing during this session. If either ever passes, the Core rule 7
story is broken and that is a stop-work issue.

Finally, `npm run dev` and open `/` — it lists the eight hypotheses read from
`lib/config/hypotheses.ts`, which proves the framework-free domain layer reaches the app
layer.
