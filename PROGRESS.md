# Progress Log

## Current state

The repo is scaffolded and verified end to end, but there are **no features and no
database schema**. `npm run build`, `npm run check` (typecheck + lint + unit tests) and
`npm run test:e2e` all pass on a clean checkout.

What exists: Next.js 16 (App Router, Turbopack) with TypeScript in hard-strict mode,
Tailwind v4 with a placeholder shadcn/ui token layer, ESLint flat config + Prettier,
Vitest (5 tests, passing) and Playwright (2 smoke tests, passing on a mobile viewport).
A Neon + Drizzle data-access layer with an actor-based authorization model.
`lib/config/hypotheses.ts` holds the eight tunable guesses, and `/` renders them purely
to prove the framework-free `/lib` layer is wired to the app layer.

**Neon is connected and auth works end to end.** `neondb` on PostgreSQL 18.6 (us-east-2),
both pooled and unpooled connections verified. Neon Auth is enabled and was exercised for
real: sign-up through our own `/api/auth` proxy returned a session, `get-session` returned
it back, and rows appeared in `neon_auth.user`, `.session` and `.account`. The test user
was then deleted — `neon_auth.user` is back to 0 rows.

What does not exist: any Arena domain model (`lib/db/schema.ts` is an empty placeholder),
any query, any migration, a working seed (`scripts/seed.ts` throws on purpose), any
sign-in UI, the design language, and every feature.

**The stack diverges from the prompt pack.** Supabase was replaced with Neon + Drizzle +
Neon Auth + Vercel Blob during this session, at the user's direction. This has real
consequences for Core rule 7 — read `/docs/decisions/0002-neon-drizzle-stack-auth.md`
before writing a single query.

## Next step

Run **Prompt 1 — Domain model, licensing gate, and a seed that actually works** from
`/docs/arena-prompt-pack-FINAL.md`.

Before writing schema, translate it off Supabase using the mapping table at the bottom of
ADR 0002. Everything needed to run it is in place — the database is reachable and empty
except for the `neon_auth` schema. Concretely, Prompt 1 must produce:

- `lib/db/schema.ts` — the real Drizzle schema. Two structural requirements: Set Piece
  and Signature state must be incapable of sharing a column (Core rule 1), and nothing
  joining an entry to an identity may be reachable before a vote is recorded (Core rule 3).
- A read-only Drizzle declaration of `neon_auth.user` (note: the table is `user`, not
  `users_sync` — see the correction in ADR 0002), with the Arena profile hanging off it
  by foreign key rather than duplicating identity. Mind the camelCase column names
  (`emailVerified`, `createdAt`) — they are Better Auth's, not ours, so the schema's
  `casing: 'snake_case'` setting does not apply to them.
- Generated migrations in `/drizzle` via `npm run db:generate`.
- Query functions in `/lib/db/queries`, actor-first, each with a test proving the wrong
  actor is refused. Where the prompt says "RLS policy", write the authorization plus its
  refusal test.
- A real `scripts/seed.ts` with fixture videos. This matters more than it sounds: Prompts
  5–7 build the voting surface against this seed, before the upload pipeline exists. A
  seed that produces empty pairs makes the most important screen in the app un-buildable.

## Open questions

1. ~~**Neon credentials.**~~ **Resolved 2026-08-20.** `DATABASE_URL` and
   `DATABASE_URL_UNPOOLED` are set in `.env.local` (gitignored) and both verified
   connecting: `neondb` on PostgreSQL 18.6, `us-east-2`, user `neondb_owner`. The
   database is **empty** — only the `public` schema, zero tables.

   **Neon Auth is enabled and verified.** `NEON_AUTH_BASE_URL` is set and
   `NEON_AUTH_COOKIE_SECRET` was generated locally (32 bytes, base64url). A full
   sign-up → session → database round trip succeeded and the test user was cleaned up.
   Nothing auth-related is outstanding for Prompt 1.

2. **Git remote.** The user asked to push over SSH but has not supplied the repository
   URL. A local git repo exists with one commit; no remote is configured.
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
6. **Storage of minors' dates of birth.** Neon Auth's `user` table is Better Auth's and
   we do not control its columns, so date of birth belongs on the Arena profile table.
   Confirm in Prompt 1 and probably write an ADR.

## Completed

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
5. **Lazy auth construction.** The Stack app is built on first use, not at module scope,
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
- **No credentials anywhere.** Nothing has connected to a real Neon database or Stack
  project. `.env.example` is documentation, not a working config.
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
