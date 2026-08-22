# Progress Log

## Current state

**Data model, design language, and auth all exist.** 20 tables and 1 view live on Neon, a
data-access layer over them, a seed that produces a judgeable drop, a token-driven
component library at `/design-system`, and a working sign-in and onboarding flow. A real
account can now be created, taken through onboarding, and land on `/vote`.

The **voting surface itself is still a placeholder** — that is Prompt 5, and the drop
lifecycle it depends on is Prompt 4.

`npm run build`, `npm run check` and `npm run test:e2e` all pass: 196 unit and integration
tests, 41 Playwright tests (7 visual-regression baselines, mobile only). The build
succeeds with **no environment variables set**.

What exists, on top of the Prompt 0 scaffold:

_Data (Prompt 1)_

- `lib/db/schema.ts` — two lanes in two separate tables, a composite foreign key making
  cross-brief comparisons impossible, CHECK constraints on every expressible invariant.
- `drizzle/0000_*.sql` + `drizzle/0001_triggers_and_blind_view.sql` — applied. The second
  is hand-written: the licence trigger, the no-self-vote trigger, and the
  `set_piece_entry_blind` view.
- `lib/db/queries/*` — 27 actor-first functions, re-exported through `lib/db/index.ts`.
- `scripts/seed.ts` — 2 categories, 1 open season, 3 published briefs on licensed tracks,
  60 competitors, 120 eligible entries, 800 comparisons. Deterministic and re-runnable.

_Design (Prompt 2)_

- `lib/design/tokens.ts` — the single source of truth. `app/tokens.css` is GENERATED from
  it by `npm run design:tokens`, and a test fails if they drift. ADR 0005.
- `lib/design/color.ts` — OKLCH → sRGB and WCAG contrast, so AA is a test (79 assertions)
  rather than an intention.
- 13 components in `components/ui`, 3 signature motion components in `components/motion`.
- `/design-system` — every component in every state, addressable by URL:
  `?theme=dark&scale=200&category=metal-vocals`.

_Auth and onboarding (Prompt 3)_

- `lib/policy/minorPolicy.ts` — THE age gate. Nothing else in the codebase may answer an
  age question. `isMinor` on the actor is now resolved from the stored date of birth.
- `/sign-in` — Google, plus email OTP in place of a magic link (not enabled on the
  instance; see ADR 0006). No role choice anywhere on the screen.
- `/onboarding` — date of birth, discipline, sub-style, handle and display name, then
  straight to `/vote`.
- `proxy.ts` — route protection. Next 16's name for middleware.

Still absent: the voting surface, the drop lifecycle, Mux, Inngest, Upstash, and any
rating maths (`ratings` rows are seeded, not computed).

**The stack diverges from the prompt pack** in four recorded places: Neon instead of
Supabase (ADR 0002 — read it before writing a query), two entry tables instead of one
(ADR 0004), tokens in TypeScript with generated CSS (ADR 0005), and email OTP instead of a
magic link (ADR 0006).

## Next step

Run **Prompt 4 — The weekly drop (set piece lifecycle)** from
`/docs/arena-prompt-pack-FINAL.md`.

It is the last thing standing between the current state and the voting screen in Prompt 5.
Four things in this repo are waiting for it:

- **Inngest is not installed.** Prompt 4 owns the scheduled functions that move a drop
  through its states. `inngest/README.md` records which function belongs to which prompt.
- **`publishSetPiece` exists and is system-only**, and the licence trigger already refuses
  to publish a brief whose track licence does not cover the whole drop. The scheduled job
  calls that function; it does not need to re-check the licence.
- **`set_pieces.status` has the full lifecycle** — `draft`, `scheduled`, `published`,
  `closed`, `archived` — but nothing transitions between them yet. The seed writes
  `published` directly.
- **`/vote` is a placeholder** and says so on the page. Prompt 5 replaces it; Prompt 4
  should not build the voting UI, only the lifecycle underneath it.

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
4. ~~**`isMinor` is hardcoded `true`.**~~ **Resolved 2026-08-22.** `currentActor()` now
   resolves it from `profiles.dob` through `lib/policy/minorPolicy.ts`. All three failure
   paths — no profile, no date of birth, a thrown lookup — still answer `true`.

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

### Prompt 3 — Auth and audience-first onboarding — 2026-08-22

**Files created/changed**

_The age gate_

- `lib/policy/minorPolicy.ts` — **new.** Age bands, the permission set for each, the
  refusal copy. The only module allowed to answer an age question.
- `lib/config/hypotheses.ts` — added `MIN_SIGNUP_AGE` and `PHONE_VERIFIED_VOTE_WEIGHT`.
- `lib/domain/handle.ts` — **new.** Handle rules, normalisation, reserved names.
- `lib/domain/voteWeight.ts` — **new.** Vote weight and its plain-language explanation.

_Auth_

- `lib/auth/session.ts` — **new.** `getSessionUser()`, `getActor()`, both `cache`-wrapped.
- `lib/auth/actor.ts` — `isMinor` now resolved from the stored date of birth.
- `proxy.ts` — **new.** Route protection under Next 16's name for middleware.

_Onboarding_

- `app/(auth)/sign-in/page.tsx` + `sign-in-form.tsx` — **new.**
- `app/onboarding/page.tsx`, `steps.tsx`, `actions.ts` — **new.** The four-step sequence.
- `app/vote/page.tsx` — **new.** The destination. A placeholder for Prompt 5.

_Data_

- `lib/db/schema.ts` — `profiles.primary_category_id`, `profiles.onboarding_completed_at`.
- `drizzle/0002_military_thing.sql` — generated and applied.
- `lib/db/queries/profiles.ts` — `startOnboarding`, `setPrimaryCategory`,
  `completeOnboarding`, `getOnboardingState`, `isHandleAvailable`, `setPhoneVerified`.
  `createProfile` removed — it took a handle and a date of birth with no gate.
- `lib/db/queries/setPieces.ts` — `resolveDropCategory`.
- `scripts/seed.ts` — six sub-styles, so onboarding step 3 has something to show.

_Tests_

- `tests/unit/minor-policy.test.ts` — **new.** 19 tests.
- `tests/unit/handle-and-vote-weight.test.ts` — **new.** 18 tests.
- `tests/unit/dal-authorization.test.ts` — 12 more refusals.
- `tests/e2e/auth.spec.ts` — **new.** 9 tests.

**Decisions made**

1. **Email OTP instead of a magic link.** The pack asks for a magic link; the plugin is
   not enabled on this Neon Auth instance (`/sign-in/magic-link` returns 404). Email OTP
   is, and it makes the same promise. Google is enabled and returns a real redirect. The
   instance was probed before any code was written — ADR 0006 has the table.

2. **`lib/policy/minorPolicy.ts` is the only place an age is judged.** The pack's "do not
   scatter age checks" is the whole design. If you are about to write `age >= 18`, add a
   field to `MinorPolicy` instead.

3. **`unknown` is not `blocked`.** Between signup and finishing onboarding nobody has a
   date of birth. That band is protected exactly as a minor but may still hold an account.
   A test asserts the two policies are identical, so they cannot drift.

4. **Ages are computed in UTC, which rounds DOWN.** A user in Chennai is still 12 to us for
   the first five and a half hours of their thirteenth birthday. Rounding down delays a
   birthday by under a day; rounding up admits a twelve-year-old silently.

5. **A future date of birth is `invalid`, not `blocked`** — different states, different
   messages. "Check that date", not "you are too young", because they are not.

6. **A blocked signup writes nothing.** The gate runs before the insert, so no profile row
   and no stored date of birth is left for a child we just told we cannot serve.

7. **`setPhoneVerified` takes no phone number.** Arena has no reason to store one. What we
   keep is the boolean that raises vote weight.

8. **`proxy.ts` only answers "is anyone signed in".** Deciding whether onboarding is
   finished needs a profile read, and Next's docs say proxy code may be deployed to the CDN
   and should not depend on shared modules. The onboarding redirect lives in the pages.

9. **Onboarding stores the most specific category**, and `resolveDropCategory` walks up to
   the discipline for drops and accent ramps.

**A bug found by testing the real flow**

Onboarding stored the sub-style, but seasons and briefs hang off the parent discipline — so
a judge who picked "Abhinaya" was shown "No brief is open right now" while the seeded week 3
brief sat there under "Bharatanatyam". Found by driving a real signup against the running
app, not by any unit test. `resolveDropCategory` fixes it, and it also supplies the slug
that themes the page: a bharatanatyam judge now gets the gold ramp and a metal vocalist
violet, from their own profile.

**Deferred / known gaps**

- **Phone verification does not send anything.** The domain rule, the column and the
  data-access function all exist; the SMS step does not, because the phone plugin is not
  enabled on the instance. This is the one deliverable of Prompt 3 that is genuinely
  incomplete rather than substituted.
- **No e2e coverage of the signed-in flow.** Route protection, the sign-in screen and the
  absence of any "become a competitor" path are tested; onboarding itself needs a real Neon
  Auth session, and faking one would mean asserting against a session our code never
  produces. Verified instead by driving a real signup against the running app.
- **No sign-out, no settings, no account deletion.** `/settings` is in the proxy matcher
  and does not exist yet. Deletion matters for Prompt 19.
- **The date of birth cannot be corrected.** Written once, deliberately. A typo currently
  needs database access — a support surface, not a settings toggle, but it needs to exist.
- **No rate limiting on the OTP endpoint.** Upstash arrives with Prompt 14.
- **`profiles.country` and `city` are never collected.** The columns exist and
  `minorPolicy` already governs showing a city; nothing writes them.

**How to verify it works**

```bash
npm run db:migrate && npm run db:seed
npm run check          # 196 tests
npm run test:e2e       # 41 tests
npm run dev            # then open /sign-in
```

Signed out, `/vote`, `/onboarding` and `/settings` all redirect to `/sign-in?next=…`, while
`/` and `/design-system` stay open — Core rule 4 is audience-first, and an audience product
that demands an account before showing anything has the funnel backwards.

### Prompt 2 — Design language — 2026-08-22

**Files created/changed**

_Tokens_

- `lib/design/tokens.ts` — **new.** Semantic colour for both themes, three category accent
  ramps, four division tier colours, type scale, line heights, tracking, weights, spacing,
  radii, elevation, durations, easings, `MIN_TOUCH_TARGET_PX`.
- `lib/design/color.ts` — **new.** OKLCH → sRGB (Ottosson's OKLab reference), WCAG
  relative luminance and contrast ratio. Framework-free, so contrast is unit-testable.
- `lib/design/css.ts` — **new.** Renders the tokens to CSS custom properties.
- `lib/design/copy.ts` — **new.** Banned words, banned slang, emoji pattern.
- `scripts/build-tokens.ts` — **new.** `npm run design:tokens` writes `app/tokens.css`.
- `app/tokens.css` — **generated. Do not hand-edit.**
- `app/globals.css` — rewritten. Maps tokens onto Tailwind's `@theme` and onto the
  shadcn/ui variable names, plus the base layer: `.arena-numeric`, `.arena-label`, one
  focus treatment, the 48px floor, reduced motion.
- `app/layout.tsx` — Inter (UI), Archivo (numbers and results), Geist Mono (timing
  labels). `data-category="default"` on `<html>`.

_Components_

- `components/ui/` — `button`, `card`, `video-tile`, `rating-badge`, `league-badge`,
  `stat-delta`, `set-piece-card`, `countdown-bar`, `sheet`, `tabs`, `toast`,
  `progress-ring`, `empty-state`.
- `components/motion/` — `reveal-card` (380ms spring flip), `rating-ticker` (a real
  per-digit odometer), `result-reveal` (staged), `use-reduced-motion`.
- `app/design-system/page.tsx` + `interactive.tsx` — **new.** The gallery.
- `app/page.tsx` — restyled onto the tokens; still reads the seeded drop through the DAL.

_Tests_

- `tests/unit/tokens-contrast.test.ts` — 79 assertions.
- `tests/unit/tokens-sync.test.ts` — generated CSS must match the tokens.
- `tests/unit/copy-rules.test.ts` — walks every `.tsx` in `app/` and `components/`.
- `tests/e2e/design-system.spec.ts` + 7 committed baselines (~2.3 MB).

_Dependencies added_

- `@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `@radix-ui/react-slot`, `sonner`.

**Decisions made**

1. **Tokens in TypeScript, CSS generated from them, with a drift test.** Tailwind v4 wants
   tokens in CSS; the prompt pack wants them in TypeScript; keeping both by hand is how a
   design system stops being trusted. ADR 0005.

2. **AA contrast is a test, not an intention.** 79 pairings — every text token on every
   surface, focus rings and meaningful borders at 3:1, every accent ramp in both themes
   including hover states, which is where these usually slip. Writing OKLCH → sRGB by hand
   was the cost of that, and it is about 60 lines.

3. **Category hues must be more than 30° apart.** Also a test. Two disciplines converging
   on the same accent would quietly defeat the point of theming.

4. **No Radix for motion; CSS only.** The three signature components are CSS transitions
   plus state. A spring flip, a digit strip and three staggered delays did not justify a
   motion library on a product whose thesis is bounded sessions.

5. **`VideoTile` has no identity prop, and must never get one.** Core rule 3 enforced by
   the type rather than by care: a component that cannot accept a handle cannot leak one
   during a blind vote.

6. **`RatingBadge` and `RatingTicker` require `onExplain`.** Core rule 6 says every number
   is explainable, so there is deliberately no display-only variant of either.

7. **The gallery is URL-driven, not stateful.** `?theme=&scale=&category=` means the
   screenshot suite navigates rather than replays clicks.

8. **Visual baselines are mobile-only.** Mobile is the primary target and every baseline
   is a committed PNG. Desktop still runs the accessibility and overflow tests.

9. **`sm` buttons are 36px tall with a 48px hit area** via an `::after` overlay, so a dense
   scoreboard row stays pressable. The touch-target test measures the overlay, not the box
   — an earlier version failed those buttons for being exactly as designed.

**Three bugs found by the tests, worth recording**

- **The type scale did not work at all.** `--arena-text-*` were declared on `:root` as
  `calc(var(--arena-font-root) * n)`, and the gallery overrode `--arena-font-root` on a
  wrapper. A custom property referencing another resolves in the scope where it is
  _declared_, so descendants inherited an already-computed value: 100%, 150% and 200%
  rendered identically at 5771px. Caught by comparing screenshot heights. Fixed by
  emitting the steps for `[data-arena-type-scope]` as well. Full account in ADR 0005.
- **`RevealCard` set `inert=""`**, which React treats as false — so the hidden face of the
  flip was still focusable and still in the accessibility tree. A keyboard user could have
  reached a competitor's name before voting, which is Core rule 3 broken through a route
  nobody would have looked at.
- **Two layout breaks at 200% type**, both invisible until the scale bug above was fixed: a
  `w-28` label overflowing its own box, and `whitespace-nowrap` on a full-width button
  pushing the page sideways.

**Deferred / known gaps**

- **The scrub-sync compare is not built.** The design direction names it as a signature
  moment — two clips scrubbed to the same timestamp, which no other platform can offer
  because no other platform has everyone performing the same brief. It needs the voting
  screen to exist, so it belongs to Prompt 5.
- **No sound.** The direction asks for the blind reveal to have "motion and sound". Audio
  needs an autoplay-policy and mute-preference story, and a sixty-year-old judging on a
  bus should not be ambushed. Revisit with Prompt 5.
- **No desktop visual baselines.** See decision 8.
- **`EMOJI_PATTERN` is range-based**, so an exotic new pictograph could slip through. It
  covers the ranges that actually appear in product copy.
- **The copy scan is a regex, not a parser.** It reads JSX text nodes and prose props, and
  is deliberately conservative — it would rather miss a string than cry wolf and be
  deleted. Strings assembled at runtime should call `assertSystemCopy` instead.
- **No `prefers-contrast: more` variant**, and no reduced-transparency handling.
- **Tier colours are not category-themed.** Bronze through elite are fixed metallics in
  every discipline, which seemed right — a division is a division — but is untested.

**How to verify it works**

```bash
npm run check                      # 146 tests, including 79 contrast assertions
npm run design:tokens              # regenerate; `npm run check` fails if you forget
npx playwright test tests/e2e/design-system.spec.ts
npm run dev                        # then open /design-system
```

The three axes are worth clicking through by hand at least once:

- `/design-system?theme=dark`
- `/design-system?scale=200` — everything should scale and nothing should scroll sideways
- `/design-system?category=metal-vocals` — accents go violet, chrome stays neutral

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
