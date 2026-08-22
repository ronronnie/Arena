# Arena — Project Constitution

> Read this file first. Then `PROGRESS.md`. Then the latest ADRs in `/docs/decisions/`.
> This file changes rarely. `PROGRESS.md` changes every session.

---

## Starting a new session

**Any Claude opening this repo must do this before touching code:**

1. Read `CLAUDE.md` (this file) in full.
2. Read `PROGRESS.md`, especially **Current state** and **Next step**.
3. Read the most recent files in `/docs/decisions/`.
4. Report back: (a) the state of the project in your own words, (b) what the next step
   is, (c) anything in the log that looks stale, contradictory, or worth clarifying.
5. **Wait for the go-ahead.** Then work from the `Next step` line — not from your own
   idea of what should come next.

**Every session ends by updating `PROGRESS.md`:** mark the prompt complete, list files
created or changed, record decisions and trade-offs, note what was deliberately deferred,
and write the exact next step for a fresh session. Add new domain terms to the glossary
below. If you made an architectural choice worth revisiting, add an ADR.

The work is sequenced as 22 prompts in `/docs/arena-prompt-pack-FINAL.md`. Run them in
order, one per session. Do not batch two prompts together.

---

## What Arena is

A web-first PWA where performers are ranked against each other by **blind pairwise
voting** on an identical weekly task, plus a weighted judge panel.

It is explicitly **NOT a social network**. No follower feed. No DMs. No infinite scroll.
Users don't "post", they **enter**. They aren't "creators", they're **competitors**. It
isn't a timeline, it's a **season**.

We compete with Duolingo and Chess.com for a habit slot — not with Instagram for
attention hours.

The core mechanic is borrowed deliberately. LMArena (Chatbot Arena) used blind pairwise
voting feeding a Bradley-Terry rating and became the standard its entire industry rates
itself by. Same model, applied to performing arts instead of AI models.

---

## The eight core rules

These hold everywhere in this codebase. If a feature request conflicts with one, the
rule wins until the rule is explicitly changed in an ADR.

**1. Two lanes.**
_Set Piece_ is the ranked lane: every competitor performs an identical weekly brief,
judged blind, and this is the **only** thing that affects rating. _Signature_ is the
unranked lane: freeform, personality-driven, affects following only. Rating and
following must never contaminate each other — structurally, not just by convention.

**2. Ranking comes from head-to-head blind comparisons (Glicko-2).**
Never from likes, views, or follower counts. If a number feeds a rating, it came from a
comparison.

**3. Blind before, revealed after.**
Voters never see a competitor's identity, avatar, or follower count **before** voting.
Identity is revealed after the vote, as the reward. Model the reveal as a state change,
not a rendering decision.

**4. Audience-first.**
Everyone signs up as a judge. Competing is an **unlock** earned after
`UNLOCK_THRESHOLD` judged pairs — not a signup option. There is no "I'm a performer"
button on the signup screen.

**5. Divisions, not one global list.**
Users compete inside divisions of ~`DIVISION_SIZE` similarly rated people. Most users
should be able to win in their division. A global leaderboard where 99% of people lose
is the thing we are specifically trying not to build.

**6. Every number is explainable.**
Any number shown to a user must open a plain-language explanation when tapped.
Transparency is an interaction pattern here, not a policy page.

**7. Assume minors.**
Users may be under 18. No contact surface between judges and minors. No DMs. Strict
authorization on all personal data — see _Data access_ below, this one has teeth.

**8. Optimise for short sessions.**
Time-in-app is the wrong metric. We want **sessions-per-week** and
**entries-per-season**. Bounded, purposeful sessions. No infinite scroll, no red-dot
spam, no manipulative streaks, no "your rank is dropping!" panic.

---

## Stack

| Layer         | Choice                             | Notes                                                                             |
| ------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| Framework     | Next.js 16, App Router             | TypeScript strict, React 19. See ADR 0003 — the pack pins 15                      |
| Styling       | Tailwind v4 + shadcn/ui            | Tokens in `lib/design/tokens.ts`; `app/tokens.css` is GENERATED — see ADR 0005    |
| Database      | **Neon** Postgres                  | Serverless driver, pooled for app / unpooled for DDL                              |
| ORM           | **Drizzle**                        | `snake_case` casing, schema in `lib/db/schema.ts`                                 |
| Auth          | **Neon Auth** (hosted Better Auth) | Identity lives in the `neon_auth` schema of our own Postgres; the table is `user` |
| Storage       | **Vercel Blob**                    | Avatars, thumbnails, result cards. Not performance video                          |
| Video         | Mux                                | Signed playback — entries are private until a drop opens (Prompt 8)               |
| Jobs          | Inngest                            | Drops, ratings, seasons, integrity sweeps                                         |
| Rate limiting | Upstash Redis                      | Vote integrity (Prompt 14)                                                        |
| Hosting       | Vercel                             |                                                                                   |
| Analytics     | PostHog + Sentry                   | Prompt 20                                                                         |
| Tests         | Vitest (unit) + Playwright (E2E)   |                                                                                   |

> **This diverges from the prompt pack**, which specifies Supabase and Next 15. Neon +
> Drizzle + Neon Auth + Vercel Blob was chosen during Prompt 0, and Next was moved to 16
> because the Neon Auth SDK requires it. The consequences — especially for Core rule 7 —
> are in `/docs/decisions/0002-neon-drizzle-neon-auth.md`, and the framework bump is in
> `/docs/decisions/0003-next-16.md`. Read 0002 before writing any query. Where a later
> prompt says "Supabase" or "RLS policy", read it as "Neon" and "data-access-layer
> authorization".

### Auth, concretely

Neon Auth is a **hosted Better Auth instance**, not Stack Auth. Identity tables live in
the `neon_auth` schema of the same Neon database: `user`, `session`, `account`,
`verification`, `jwks`, `organization`, `member`, `invitation`. There is no `users_sync`
table — that belonged to the older Stack-based Neon Auth. The Arena profile hangs off
`neon_auth.user`; we never duplicate identity.

The browser never talks to Neon Auth directly. `app/api/auth/[...path]/route.ts` proxies
to the hosted instance and exchanges its response for a first-party HttpOnly session
cookie signed with our own `NEON_AUTH_COOKIE_SECRET`.

---

## Folder conventions

```
/app                    Next.js routes. Thin. No database access, ever.
  /design-system        The component gallery. URL-driven: ?theme=&scale=&category=
  tokens.css            GENERATED from lib/design/tokens.ts. Do not hand-edit.
/components             React components.
  /ui                   shadcn/ui primitives, restyled to Arena tokens.
  /motion               The signature moments. Each has a reduced-motion equivalent.
/lib                    Domain logic. FRAMEWORK-FREE — no React, no Next imports.
  /config               hypotheses.ts and other tunables.
  /design               tokens.ts (source of truth), color.ts (WCAG maths), copy.ts.
  /policy               minorPolicy.ts — THE age gate. No age check may live anywhere else.
  /domain               Pure business logic: rating, eligibility, divisions, pairing.
  /db                   The ONLY path to the database.
    /queries            One file per aggregate. Every function takes an Actor first.
    client.ts           Raw Drizzle client. Importable only from within /lib/db.
    actor.ts            Who is asking. Framework-free authorization primitives.
    schema.ts           Drizzle schema.
    auth-schema.ts      neon_auth.user, read-only. Kept out of drizzle-kit's sight.
  /auth                 Neon Auth wiring. The one place a session becomes an Actor.
  /ui                   Small UI helpers (cn).
proxy.ts                Route protection. Next 16's name for middleware — not `middleware.ts`.
/inngest                Background and scheduled functions.
/drizzle                Generated migrations. Do not hand-edit.
/scripts                seed.ts, migrate.ts, build-tokens.ts, make-fixtures.sh.
/tests
  /unit                 Vitest.
  /integration          Vitest against a real Postgres. Skips without DATABASE_URL.
  /e2e                  Playwright, including visual regression baselines.
/docs
  /decisions            ADRs, numbered.
```

Two boundaries are enforced by ESLint, not by good intentions:

- **`/lib` is framework-free.** Domain logic cannot import React, Next, or the UI layer.
  Rating maths should be testable without a browser.
- **Nothing outside `/lib/db` may import `lib/db/client`.** See below.

---

## Data access — read this before writing a query

We moved off Supabase, which means **Postgres no longer enforces row-level security for
us**. The guarantee that a query cannot read data it shouldn't is now enforced in
application code. That is a real downgrade, and it only holds if it has no exceptions.

The rules:

1. Every data-access function takes an `Actor` as its **first argument**. There is no
   implicit "current user" and no default. The caller states whose authority a query
   runs on.
2. Authorize at the top of the function — `requireUser`, `requireSelfOrSystem` — or
   leave a comment explaining why the data is genuinely public.
3. Never `select *`. Core rule 3 dies quietly the first time an entry row arrives with a
   `user_id` attached during a blind vote.
4. Every query touching personal data needs a test proving the **wrong** actor gets a
   `ForbiddenError`. Test the authorization, not just the result.
5. `system()` actors bypass user-scoped checks and require a stated reason. Construct
   them only in Inngest functions, seeds, and moderation tooling — never from a request.

---

## Commands

```bash
npm run dev            # dev server (Turbopack)
npm run build          # production build
npm run check          # typecheck + lint + unit tests. Run before you say "done".

npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run lint:fix
npm run format         # prettier --write .
npm run format:check

npm test               # vitest — unit tests, plus tests/integration when DATABASE_URL is set
npm run test:watch
npm run test:coverage
npm run test:e2e       # playwright (boots the dev server itself)

npm run design:tokens  # regenerate app/tokens.css from lib/design/tokens.ts

npm run db:generate    # generate a migration from schema.ts
npm run db:migrate     # apply migrations (unpooled connection; see scripts/migrate.ts)
npm run db:push        # push schema without a migration — local only
npm run db:studio      # Drizzle Studio
npm run db:seed        # seed fixture data
```

---

## Hypotheses, not constants

`lib/config/hypotheses.ts` holds every number that is a **guess rather than a finding**:
the unlock threshold, division size, promotion and relegation counts, the entry-to-fan
ratio, view caps, rating thresholds.

Nothing outside that file may hardcode any of them. Each carries a comment saying what
it is based on and what evidence would change it. When evidence arrives: change the
value **and** write an ADR recording what was learned.

---

## Glossary

| Term                  | Meaning                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Set piece**         | The ranked lane. An identical weekly task every competitor performs. The only thing that affects rating.                                                                |
| **Signature**         | The unranked lane. Freeform, personality-driven work. Affects following only, never rating.                                                                             |
| **Brief**             | The specification of a set piece for a given week — the task, its constraints, and its tutorial.                                                                        |
| **Drop**              | The weekly release of a new brief and the lifecycle that follows it: brief opens, entries close, voting opens, results publish. The ritual the product is built around. |
| **Entry**             | One competitor's submitted performance of a brief. Users don't post; they enter.                                                                                        |
| **Lane**              | Set piece or signature. The two are structurally separate — see Core rule 1.                                                                                            |
| **Season**            | A bounded run of drops ending in promotion and relegation. Replaces the timeline as the unit of time.                                                                   |
| **Category**          | A discipline (e.g. bharatanatyam, metal vocals, hip-hop). Competitors are only ever compared within one. Each gets its own accent ramp.                                 |
| **Division**          | A group of ~`DIVISION_SIZE` similarly rated competitors within a category. Where you actually compete.                                                                  |
| **Comparison**        | One judge's blind head-to-head choice between two entries on the same brief. The atomic unit of the rating system.                                                      |
| **Rating**            | A competitor's Glicko-2 skill estimate, derived only from comparisons in the set piece lane.                                                                            |
| **Rank**              | Position within a division or category, derived from rating. Rating is the number; rank is the position.                                                                |
| **Compete-unlock**    | The gate at `UNLOCK_THRESHOLD` judged comparisons after which a user may enter. Earned, never offered at signup.                                                        |
| **Judge calibration** | How closely a judge's comparisons track consensus and the expert panel. Weights their vote.                                                                             |
| **Eligibility check** | The set of conditions an entry must satisfy to be rated: correct brief, within the window, meets the brief's constraints, passes integrity checks.                      |
| **Actor**             | Who a query runs on behalf of: a user, an anonymous visitor, or the system. Every data-access function takes one.                                                       |
| **Hypothesis**        | A tunable number in `lib/config/hypotheses.ts` that is a guess, not a finding.                                                                                          |
| **Track**             | The licensed music a set piece is performed to. Carries its own licence window, territory and contract reference.                                                       |
| **Licence window**    | The period a track is cleared for. A brief cannot publish unless its track's window covers the whole drop, `opens_at` to `judging_ends_at`. Enforced by a trigger.      |
| **Blind view**        | `set_piece_entry_blind` — the identity-free view the voting surface reads. Has no `user_id` column at all. Core rule 3 as a database object, not a select-list habit.   |
| **Reveal**            | The state change after a vote is recorded, when a competitor's identity becomes readable. Only ever through `revealComparison`, and only for the voter who decided it.  |
| **Fixture clip**      | A committed stand-in video under `public/fixtures/`. Generated, not sourced, so there is no licence to honour. How the voting surface gets built before Mux exists.     |
| **Season result**     | A competitor's final standing in a season: rating, position, division, and whether they were promoted, held, or relegated.                                              |
| **Accent ramp**       | The five-colour set (`soft`, `text`, `base`, `strong`, `onAccent`) that themes one category. Swapped at the root by `data-category`; defined in `lib/design/tokens.ts`. |
| **Type scope**        | An element carrying `data-arena-type-scope`, which re-derives the whole type scale from its own `--arena-font-root`. How 150% and 200% dynamic type are rendered.       |
| **Signature moment**  | One of the four places the product is allowed ceremony: the blind reveal, the scrub-sync compare, the rating tick, and the season result card.                          |
| **Age band**          | `unknown`, `invalid`, `blocked`, `minor` or `adult`. Produced only by `lib/policy/minorPolicy.ts`, which is the one module allowed to answer an age question.           |
| **Minor policy**      | The permission set for an age band — contact, public location, leaderboard, notifications. Import it; never re-derive an age check anywhere else.                       |
| **Sub-style**         | A child category (`categories.parent_id`), e.g. Abhinaya under Bharatanatyam. Onboarding stores the most specific one; drops and accent ramps hang off its discipline.  |
| **Vote weight**       | How much one judge's comparison counts. Phone verification raises it, judge calibration scales it, and it is stamped on the comparison when the vote is cast.           |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
