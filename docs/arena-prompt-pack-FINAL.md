# Arena — Claude Code Prompt Pack (FINAL)

22 sequenced prompts. Built around three locked decisions: **not a social network**, **audience-first with competing as an unlock**, and **two lanes — Set Piece (ranked) and Signature (unranked)**.

Stack: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui · Supabase (Postgres/Auth/RLS/Storage) · Mux · Inngest · Upstash Redis · Vercel · PostHog + Sentry.

---

## Before you run a single prompt

None of this is code. All of it will change what the code should be.

- [ ] **Run one season offline.** One city, one category, a form, a WhatsApp group, one set piece, three real judges, one real prize. Three weeks. You will learn more from this than from Phases 0–2.
- [ ] **Answer the prize question.** What does winning get someone in week one, legally, in your launch market? Contest rules, age minimums, tax, and the skill-vs-chance and GST treatment in India.
- [ ] **Line up the set-piece supply chain.** One choreographer committed to a brief + tutorial every week. A missed drop breaks the ritual, and the ritual is the product.
- [ ] **Sign 3–5 studios or college clubs.** Cold start is a sales problem, not an engineering one. You need ~300–500 seeded competitors, not a marketing budget.
- [ ] **Write your kill criteria down now.** Mine: if across three manual seasons fewer than ~40% of entrants return for the next one, divisions don't solve the losing problem and the thesis is wrong. Set yours while you're still clear-headed.

### Note on the ordering

The audience product is built **before** the competitor product, because the audience is the market and voting is the raw material of everything else. You can't vote without entries, so Prompt 1 seeds the database with real fixture videos and Prompts 5–7 are built against that seed. The upload pipeline comes after. This is deliberate: the voting surface gets the most iteration time.

### Session continuity

Two files carry state between sessions, and every prompt ends by updating them.

- **`CLAUDE.md`** — the constitution. Rules, stack, conventions, glossary. Changes rarely.
- **`PROGRESS.md`** — the log. Done, next, deferred. Changes every session.

**Starting a fresh Claude Code session? Paste this first:**

```
Read CLAUDE.md, then PROGRESS.md, then the most recent files in /docs/decisions/.
Do not write any code yet. Tell me back: (a) the current state of the project in your own
words, (b) what the next step is, (c) anything in the log that looks stale, contradictory,
or that you'd want clarified before proceeding. Then wait for my go-ahead.
```

---

## Phase 0 — Foundation

### Prompt 0 — Project constitution

```
I'm building "Arena", a web-first PWA where performers are ranked against each other by
BLIND PAIRWISE VOTING on an identical weekly task, plus a weighted judge panel.

It is explicitly NOT a social network. There is no follower feed, no DMs, no infinite
scroll. Users don't "post", they "enter". Not creators — competitors. Not a timeline —
a season. We compete with Duolingo and Chess.com for a habit slot, not with Instagram for
attention hours.

Core rules that must hold everywhere in this codebase:
1. TWO LANES. "Set Piece" is the ranked lane: every competitor performs an identical
   weekly brief, judged blind, and this is the ONLY thing that affects rating. "Signature"
   is the unranked lane: freeform, personality-driven, affects following only. Rating and
   following must never contaminate each other.
2. Ranking comes from head-to-head blind comparisons (Glicko-2). Never from likes, views,
   or follower counts.
3. Voters never see a competitor's identity, avatar, or follower count BEFORE voting.
   Identity is revealed after the vote as the reward.
4. AUDIENCE-FIRST. Everyone signs up as a judge. Competing is an UNLOCK earned after
   ~25 judged pairs — not a signup option.
5. Users compete inside divisions of ~30 similar-rated people, not one global list. Most
   users should be able to win in their division.
6. Every number shown to a user must be explainable by tapping it.
7. Users may be minors. Assume it. No contact surface between judges and minors, no DMs,
   strict RLS on all personal data.
8. Optimise for SHORT sessions. Time-in-app is the wrong metric. We want sessions-per-week
   and entries-per-season.

Set up the repo:
- Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui, ESLint + Prettier
- Supabase clients (server + browser), typed from the DB schema
- Vitest for unit tests, Playwright for E2E
- Folders: /app, /lib (domain logic, framework-free), /components, /inngest,
  /supabase/migrations, /tests, /docs/decisions
- .env.example with every var documented

Write CLAUDE.md at the repo root: the product summary, all eight core rules, the stack,
folder conventions, commands (dev/test/lint/migrate/seed), and a domain glossary defining:
set piece, signature, brief, drop, entry, lane, season, category, division, comparison,
rating, rank, compete-unlock, judge calibration, eligibility check.

Also create the session-continuity system:
- PROGRESS.md at the repo root with this exact structure:
    # Progress Log
    ## Current state          <- one paragraph: what works now, what doesn't
    ## Next step              <- single next action, written for a fresh session
    ## Open questions         <- things needing my decision
    ## Completed
    ### Prompt N — <title> — <date>
    - Files created/changed:
    - Decisions made:
    - Deferred / known gaps:
    - How to verify it works:
- /docs/decisions/0001-stack-choice.md as the first ADR.
- A "Starting a new session" section in CLAUDE.md instructing any future Claude to read
  CLAUDE.md, then PROGRESS.md, then the latest ADRs BEFORE touching code, and to work from
  the "Next step" line.

One more thing — create /lib/config/hypotheses.ts. Several numbers in these rules are
GUESSES, not findings, and I want them in one file rather than scattered as magic numbers
so I can tune them the moment real users tell me otherwise. Each needs a comment saying
what it's based on and what evidence would change it:
- UNLOCK_THRESHOLD = 25            // comparisons before competing unlocks. A guess.
- DIVISION_SIZE = 30               // borrowed from Duolingo Leagues, not from our users.
- PROMOTE_COUNT = 7, RELEGATE_COUNT = 5
- TARGET_ENTRY_TO_FAN_RATIO = 0.2  // 1 entry per 5 fans. Arithmetic on an assumption.
- MAX_VIEWS_PER_ENTRY = 200        // when an entry goes stale for the audience. A guess.
- PROVISIONAL_RD_THRESHOLD, MIN_COMPETITORS_TO_SHOW_BOARD = 20
Nothing outside this file may hardcode any of them.

For context on why the core mechanic is built this way: LMArena (Chatbot Arena) uses the
same approach — blind pairwise voting feeding a Bradley-Terry rating — and it became the
standard its whole industry rates itself by. That's the model we're following, applied to
performing arts instead of AI models.

No features yet. Scaffold, tooling, CLAUDE.md, PROGRESS.md, hypotheses.ts only.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 1 — Domain model, licensing gate, and a seed that actually works

```
Read CLAUDE.md. Implement the Postgres schema as Supabase migrations.

Core entities:
- profiles (display_name, handle, dob, country, city, is_judge, is_minor, phone_verified,
  comparisons_completed, compete_unlocked_at, created_at)
- categories (slug, name, parent_id for sub-styles, e.g. dance > hip-hop)
- seasons (category_id, number, starts_at, ends_at, status)

THE SET PIECE SYSTEM (this is the heart of the product):
- tracks (title, artist, licensor, license_type, license_starts_at, license_expires_at,
  territory, usage_terms, fingerprint_ref, contract_ref)
- set_pieces (season_id, category_id, week_no, title, brief_text, requirements jsonb
  {duration_s, framing, takes, wardrobe...}, tutorial_mux_asset_id, track_id,
  creator_credit, opens_at, submit_by, judging_ends_at, status)
- HARD CONSTRAINT: a set_piece cannot move to status='published' unless it has a track_id
  pointing at a track whose license window covers the set piece's entire judging period.
  Enforce with a trigger, not application code. Write the test that proves it fails.

- entries (user_id, season_id, category_id, lane enum('set_piece','signature'),
  set_piece_id nullable, mux_asset_id, playback_id, duration_ms,
  status enum('uploading','processing','under_review','eligible','rejected','withdrawn'),
  rejection_reason, created_at)
  CONSTRAINT: lane='set_piece' requires set_piece_id NOT NULL; lane='signature' requires
  set_piece_id IS NULL.
- eligibility_checks (entry_id, check_type, status, score, detail jsonb, ran_at)
- comparisons (set_piece_id, voter_id, entry_a, entry_b, winner_entry_id, shown_at,
  decided_at, voter_weight numeric, is_counted bool, discount_reason)
  CONSTRAINT: both entries must share the same set_piece_id. A comparison can never
  involve a signature-lane entry. A voter can never be shown their own entry.

- ratings (user_id, category_id, rating, rating_deviation, volatility, updated_at)
- rating_history (append-only, one row per rating period)
- divisions (season_id, tier enum('bronze','silver','gold','elite'), name)
- division_members (division_id, user_id, points, position)
- judge_scores / judge_calibration / season_results
- follows (unranked social graph — affects following only, never rating)
- reports / moderation_actions / appeals

Requirements:
- RLS on every table. Entry videos publicly readable only when status='eligible'.
  Users read their own PII only.
- Indexes for hot paths: comparisons by voter, entries by (set_piece_id, status),
  leaderboard by (season_id, category_id, rating desc).
- Generate TS types into /lib/db/types.ts.
- SEED SCRIPT THAT MAKES THE APP USABLE: 2 categories, 1 open season, 3 published set
  pieces with licensed dummy tracks, 60 fake competitors with plausible rating spread,
  ~120 eligible set-piece entries using real short fixture videos (commit a handful of
  tiny CC0 clips and reuse them), and 800 comparisons. The voting screen must be fully
  exercisable from seed data alone — Prompts 5-7 depend on this.

Write migration tests asserting: RLS blocks cross-user reads, the license-window trigger
rejects an unlicensed publish, and the cross-set-piece comparison constraint holds.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 2 — Design language (before any feature UI)

```
Read CLAUDE.md. Establish the design system before we build feature screens. Read the
"Design Direction" appendix at the bottom of this prompt pack and implement it as code.

Design thesis: BROADCAST, NOT FEED. Reference set is F1 timing graphics, Olympic
scoreboards, Chess.com and Apple Fitness rings — not Instagram. This is how we read as
serious rather than as a teen app, which is how a 15-year-old and a 45-year-old classical
dancer end up in the same product.

Deliverables:
1. /lib/design/tokens.ts — color (light + dark, per-category accent ramps), type scale,
   spacing, radii, elevation, motion durations and easings. Tokens only; no component
   hardcodes a value.
2. Tailwind config wired to the tokens, plus a `data-category` attribute on <html> that
   re-themes the accent ramp per category.
3. /components/ui on shadcn, restyled to our tokens: Button, Card, VideoTile, RatingBadge,
   LeagueBadge, StatDelta, SetPieceCard, CountdownBar, Sheet, Tabs, Toast, ProgressRing,
   EmptyState.
4. Three signature motion components in /components/motion/:
   - RevealCard: post-vote identity reveal (card flip, ~380ms, spring)
   - RatingTicker: odometer counting a rating up/down with a settle bounce
   - ResultReveal: staged season-result choreography (position, then delta, then badge)
   All respect prefers-reduced-motion with a non-animated equivalent conveying the same
   information.
5. Accessibility in the primitives, not bolted on: 48px minimum touch targets, WCAG 2.1 AA
   contrast enforced by a token-level test, full keyboard operation, dynamic type to 200%
   without layout breakage, never color as the sole signal.
6. A /design-system route rendering every component in every state, light and dark, at
   100% / 150% / 200% type scale.

Copy rules to encode in a lint rule or test: no emoji in system copy, no slang, and the
strings "lost", "failed", "worst" never appear in user-facing text.

Add Playwright visual regression over /design-system.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 3 — Auth and audience-first onboarding

```
Read CLAUDE.md. Implement auth and account setup. Remember rule 4: everyone signs up as a
JUDGE. Do not ask anyone to upload anything during onboarding.

- Supabase Auth: email magic link + Google. Phone verification as a separate optional step
  that increases vote weight.
- Signup collects date of birth FIRST. Under 13 blocked. 13-17 flagged is_minor: no public
  city, no judge contact, reduced profile surface. All of this lives in ONE module,
  /lib/policy/minorPolicy.ts, imported everywhere. Do not scatter age checks.
- Onboarding sequence: DOB -> pick category -> pick sub-style -> handle + display name ->
  DROPPED STRAIGHT INTO THE VOTING SCREEN. The first meaningful action in this product is
  judging, not signing up to compete. There must be no "become a competitor" option
  visible at this stage.
- Middleware for protected routes, a getSessionUser() server helper.

Tests for the age gate: exactly 13 today, exactly 18 today, timezone edges, future DOB.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

---

## Phase 1 — The audience product

### Prompt 4 — The weekly drop (set piece lifecycle)

```
Read CLAUDE.md. Build the set piece system — the weekly ritual the whole product runs on.

Admin side:
- Create a set piece: title, brief text, structured requirements (duration, framing,
  number of takes), upload a tutorial video to Mux, attach a licensed track, set
  opens_at / submit_by / judging_ends_at, assign creator credit.
- Publish is BLOCKED unless the license window covers the judging period (Prompt 1's
  trigger). Surface the reason clearly in the admin UI.
- A track library screen: licensed catalog with license windows, territories, and an
  expiry warning for anything lapsing within 30 days.

User side:
- /drop — this week's set piece for the user's category: the brief, the tutorial video,
  the requirements as a checklist, a countdown to submit_by, and how many people have
  entered so far.
- Lifecycle states rendered honestly: upcoming / open for entries / entries closed,
  judging / results. Each with its own screen and CTA.
- Past set pieces archive with the winning entries.

Inngest scheduled functions driving transitions: open -> submissions -> judging -> close.
Each emits events. A weekly cron that warns admin 72h before the next drop if no set piece
is published for an active category — a missed drop breaks the ritual and must page you.

Tests: lifecycle transitions, license gating, countdown boundary behaviour.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 5 — Blind pairwise voting (the most important surface in the app)

```
Read CLAUDE.md. Build the voting screen against the seeded entries from Prompt 1.

Pairing logic (server action):
- Both entries MUST belong to the same set_piece_id. Never compare across set pieces, and
  never include a signature-lane entry.
- Prefer pairs with close ratings and high combined rating deviation (maximum information
  gain).
- Never show a voter their own entry. If the voter is a competitor in this set piece,
  never show them a pair from their own division, and never one involving a direct rival.
- Never repeat a pair for the same voter. Cap how often any single entry is served so
  views spread evenly — remember, guaranteed attention is our core promise, so track
  views-per-entry and actively level it.

Presentation:
- Two clips side by side (stacked on mobile), autoplay muted, loop, tap to unmute.
  NO name, NO avatar, NO follower count, NO caption. Nothing identifying.
- Pick one, or skip. One tap each. Target a vote every 8-12 seconds.
- AFTER the vote: RevealCard flips both to show handles, with a brief "you picked X"
  moment, then immediately serve the next pair. The reveal IS the reward.
- Because both clips are the same brief, add a subtle side-by-side scrub-sync option so a
  voter can compare the same moment in both performances. This is only possible because
  of the set piece — make it a highlight.

Record on each comparison: time-to-decision, whether both clips were watched, skip. These
feed vote-quality weighting in Prompt 14.

Make it fast: prefetch next pair, preload video, optimistic UI. Playwright coverage of a
full 10-pair run.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 6 — The compete unlock

```
Read CLAUDE.md. Implement the mechanic that converts audience into competitors.

- Track comparisons_completed on the profile. At 25 counted comparisons, set
  compete_unlocked_at and trigger an unlock moment.
- Before unlock, there is NO path to entering. No upload button, no "compete" tab, no
  upsell. Judging is the entire product for a new user.
- The unlock screen is a real moment, not a toast: "You've judged 25 performances. You know
  what the standard looks like. This week's set piece is open for 3 more days." Show their
  emerging taste profile (which qualities their picks favoured), then the CTA to enter.
- Progress toward unlock is visible but understated — a quiet ProgressRing, never a nag.
- Users who never unlock are first-class citizens forever. Nothing in the UI should read as
  though not competing is a lesser state.

Instrument the funnel: signup -> first vote -> 25 votes -> unlock shown -> first entry.
This funnel is the single most important thing to measure in the product.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 7 — The fan loop

```
Read CLAUDE.md. Build the reasons an audience member comes back on a Tuesday. Fans are the
market; competitors are the supply. Fans must never lose.

- Follow competitors. Notified when someone you follow enters a drop or gets promoted.
  Following affects NOTHING about rating (rule 1).
- Predictions: before judging closes, pick who finishes top 3 in a division. Score after
  close. A predictor leaderboard with its own accuracy rating, so spotting talent is
  itself a competitive game.
- "Found them first": a badge for fans who followed a competitor before they reached Gold.
  Cheap to build, strong hook, drives early-discovery behaviour.
- A taste profile: what your picks reveal about what you value. Shareable.
- Browse: this week's entries by category and division, organised around the season's
  storylines. NOT an infinite feed — bounded, with a clear end state ("that's everyone in
  Silver this week").

Rule to enforce: predictions and follows must never influence ratings. Write the test.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

---

## Phase 2 — The competitor product

### Prompt 8 — Upload pipeline

```
Read CLAUDE.md. Build entry submission for both lanes.

Flow:
1. Server action requests a direct upload URL from Mux (credentials never client-side).
2. Client uploads directly with progress UI, resumable, explicit error states.
3. Create the entry row at request time with status='uploading' so orphans reconcile.
4. Mux webhook (signature-verified, idempotent — Mux retries) advances to 'processing' and
   stores asset_id, playback_id, duration, aspect ratio.
5. Webhook triggers the Inngest eligibility workflow (stubbed here, built in Prompt 9).

Lane rules:
- Set Piece lane: only while the set piece is open; validate against that set piece's
  structured requirements (duration window, framing, single take if specified); one entry
  per user per set piece, enforced at the DB level.
- Signature lane: separate quota, no set piece, no rating impact. Gate behind the paid
  tier flag but build the flag now.
- Competing at all requires compete_unlocked_at — enforce server-side, not just in UI.

Client-side pre-checks before upload begins, failing fast with a plain-language reason.
Playwright test with a fixture video for each lane.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 9 — Eligibility engine

```
Read CLAUDE.md. Build the eligibility pipeline as an Inngest workflow: one step per check,
cheapest first, retries, dead-letter path. Each step writes an eligibility_checks row.
Hard failure -> status='rejected' with a human-readable reason. Ambiguous -> 'under_review'.

Steps in order:
1. technical — duration, resolution, audio track present, bitrate sanity, corruption.
2. brief_compliance (SET PIECE LANE ONLY) — does the entry meet this set piece's structured
   requirements? Duration within window, framing (e.g. full body visible), single take
   (detect hard cuts via scene-change detection). This check does not exist in v1 of most
   products and is only possible because of the set piece — it's a real quality lever.
3. duplicate — perceptual hash over sampled frames vs our corpus. Catches re-uploads and
   stolen clips. Store the hash.
4. audio_rights — audio fingerprinting. For set piece entries, verify the audio MATCHES the
   licensed track for that set piece (a strong, cheap signal). For signature entries,
   identify and branch: licensed / mute_required / reject.
5. safety — content moderation for nudity, violence, hate; plus speech-to-text transcript
   screened by an LLM (essential for comedy, poetry, rap).
6. synthetic — C2PA content credentials, AI-generation detection, flag entries with no
   capture metadata.

Requirements:
- EVERY external provider behind a port interface in /lib/ports/ with a deterministic fake
  for tests. I must be able to swap vendors without touching business logic.
- The whole workflow unit-testable with fakes, zero network.
- Record per-entry provider cost so I can see what each check costs me.
- POST /api/admin/reprocess/:entryId to re-run.

Tests: all-pass, each hard-fail in isolation, the ambiguous path, and a set-piece entry
using the wrong backing track.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 10 — Rating engine

```
Read CLAUDE.md. Implement rating as pure, framework-free, fully tested domain logic in
/lib/rating/ — no DB or network imports in that folder.

- Glicko-2 (rating, deviation, volatility) with rating periods.
- RatingPeriodRunner: takes all counted comparisons in a period plus judge scores, returns
  new ratings. Judge scores enter as high-weight virtual comparisons weighted by that
  judge's calibration score.
- ONLY set-piece-lane comparisons feed rating. Assert this in code and in tests — a
  signature entry must never be able to move a number.
- Provisional status: high rating_deviation shows as "provisional", excluded from published
  leaderboards but still given a number.
- explain(userId, periodId) returning a plain-language breakdown: head-to-heads won/lost,
  biggest wins, judge contributions, net delta. The UI renders this verbatim, so the output
  must read like a sentence, not a data structure.

Property-based tests: monotonic in wins; beating a higher-rated opponent gains more;
deviation shrinks with volume; deterministic for a given input set; signature entries have
zero effect.

Wire an Inngest cron running the rating period every 6 hours, writing rating_history.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 11 — Divisions, seasons, promotion and relegation

```
Read CLAUDE.md. Implement the competitive structure that stops 99% of users from feeling
like losers.

- At season start, partition each category's active competitors into divisions of ~30 by
  rating. Tiers: Bronze, Silver, Gold, Elite.
- Within a division, weekly position is by rating GAIN during the season, not absolute
  rating, so newcomers can win.
- At season close: top ~7 promote, bottom ~5 relegate, rest hold. Write an immutable
  season_results snapshot. Ratings persist across seasons; ranks reset, so no incumbent
  camps at #1 forever.
- Season lifecycle as Inngest scheduled functions, each transition emitting events.
- Season close generates every participant's result card and queues notifications.

Enforce in code and copy: we never render a bottom-of-table list, and the word "lost" never
appears. Test the promotion/relegation math and snapshot-test the result-card copy.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 12 — Leaderboards

```
Read CLAUDE.md. Build leaderboards on Redis sorted sets, rebuilt from Postgres after each
rating period (Postgres is truth, Redis is cache).

Views: my division, category global (top 100 only), city, age bracket, rising fastest
(largest rating gain), best newcomer (provisional, by win rate).

Each row: position, handle, rating, delta this period, league badge, entry thumbnail.
Tapping any rating opens the explain() breakdown from Prompt 10.

HARD REQUIREMENTS:
- The user's own position is always pinned, even if off-screen.
- If a board has under 20 qualified competitors, DO NOT render a rank list. Render
  "Season filling — N of 20 competitors". A thin leaderboard advertises our own emptiness
  and is worse than no leaderboard. This is not a nicety.
- Cache invalidation on rating period completion; manual rebuild endpoint for admin.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

---

## Phase 3 — Trust

### Prompt 13 — Judge panel

```
Read CLAUDE.md. Build the expert judge layer sitting on top of crowd voting.

- Application flow: credentials, links, and a calibration test scoring 20 already-decided
  pairs. Poor correlation with settled outcomes means no approval. Admin approves with
  notes.
- Scoring UI: watch entry, score against category-specific rubric criteria (dance:
  technique, musicality, originality, execution, presence). Rubrics are DATA, defined per
  category, editable by admin. Because everyone performed the same brief, rubrics can
  reference specific moments — support per-criterion timestamps.
- judge_calibration: recompute each judge's agreement with crowd consensus and final
  outcomes; that score is their weight in the rating engine. Show judges their own
  calibration and a judges' leaderboard — judging is a competitive game too.
- HARD CONSTRAINT: no private contact channel between any judge and any competitor, and no
  contact of any kind with flagged minors. Feedback flows only through the platform,
  attached to an entry, visible to admin. Enforce in RLS, not UI.

Tests: calibration math, weight application, and an RLS test proving a judge cannot read a
minor's PII.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 14 — Vote integrity

```
Read CLAUDE.md. Build the integrity layer. Assume motivated adversaries — the entire value
of the rating depends on this.

1. Vote weighting by account age, phone verification, historical vote quality (agreement
   with eventual consensus), and decision-time sanity (sub-2-second votes and never-watched
   clips get near-zero weight).
2. Referral discounting: if a voter's account was created via or first arrived through a
   specific competitor's share link, their votes FOR that competitor count zero. Track
   attribution at signup.
3. Competitor self-interest: a competitor's votes are high quality and we want them, but
   never serve pairs from their own division or involving a direct rival (already enforced
   in Prompt 5 — add the server-side audit that proves it never happened).
4. Collusion detection: scheduled graph analysis over the comparison log. Flag voters with
   anomalously skewed win-attribution toward one competitor, and clusters with near-
   identical voting patterns. Output to an admin queue; never auto-ban.
5. Rate limits and device fingerprinting; one entry per person per set piece enforced
   across accounts sharing a device signature.
6. Write is_counted + discount_reason on every comparison so every exclusion is auditable.

Adversarial test suite simulating: a 50-account brigading ring, a competitor importing 500
followers via share link, a speed-voter, and a division rival farming downvotes. Assert
each fails to move the target's rating meaningfully.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 15 — Moderation console and appeals

```
Read CLAUDE.md. Build the internal admin console: separate route group, role-gated, audit
log on every action.

- Review queue for 'under_review' entries showing the video, every eligibility_check with
  confidence scores, and one-click approve/reject with a reason taxonomy.
- Reports intake and triage.
- Appeals: one appeal per entry with a note, its own queue with SLA display, outcome
  written to moderation_actions, user notified with the reason.
- Minor-safety view surfacing any entry involving a flagged minor for priority review.
- Metrics panel: eligibility pass/fail by check type, provider cost per entry, queue depth
  and age, and appeal overturn rate — your model-quality signal.

Every admin action attributable and reversible.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

---

## Phase 4 — Credential and growth

### Prompt 16 — Profile and the portable credential

```
Read CLAUDE.md. Build the public profile — the durable asset of this product.

- Handle, category, current rating with league badge, rating history sparkline, season
  history, best set-piece entries, public judge feedback.
- A shareable rating card: server-rendered OG image (rating, league, category, percentile,
  season, verification mark) at a stable public URL, designed for Instagram and WhatsApp.
  This is our primary growth surface. Make it beautiful.
- /verify/[handle] — a public verification page showing the rating is real and how it was
  earned, aimed at studios, choreographers and casting people. This page is the beginning
  of the credential business; treat it as a product, not a footer link.
- Minor accounts: no city, no age, reduced surface, no search indexing.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 17 — Signature lane and rivalries

```
Read CLAUDE.md. Build the unranked lane and the narrative layer that makes fans care.

Signature lane:
- Freeform entries, no set piece, no rating impact, clearly badged as unranked.
- This is where personality and following live. Reactions and follows, no scores.
- Enforce in code that no signature entry can enter a comparison or affect a rating.

Rivalries (the narrative engine):
- A competitor can challenge a specific rival by name: same brief, both perform, head-to-
  head, publicly named — NOT blind. This is the premium content layer sitting on top of the
  blind ranked base. Boxing sells the callout, not the fight.
- Challenge lifecycle: issued -> accepted/declined/expired -> both submit -> public
  head-to-head vote -> result, with its own record on both profiles.
- Rivalry results are their own thing: they do NOT feed the blind Glicko rating (different
  information, deliberately named). They feed a separate head-to-head record.
- Fans get notified of challenges involving people they follow. This is your Tuesday.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 18 — Notifications and lifecycle

```
Read CLAUDE.md. Build notifications (web push + email, granular prefs, quiet hours in the
user's timezone).

Triggers, all in progress language, never loss language:
- the weekly drop is live (the ritual — this is the most important notification you send)
- 24h left to submit
- entry accepted / rejected (reason + appeal link)
- provisional rating ready (target: hours after upload, retention-critical)
- rating period result: "+32 this period, you won 61 of 104 head-to-heads"
- division movement, promotion (framed as moving to a new group)
- judge feedback received
- someone you follow entered the drop, got promoted, or was challenged
- prediction results

Notification budget: max N per user per day with priority ordering. Snapshot-test every
copy string; assert none contains "lost", "failed", "worst", or a bottom-rank number.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 19 — Legal and compliance surfaces

```
Read CLAUDE.md. Build compliance as product features.

- Terms, privacy policy, community guidelines, and per-season Official Contest Rules
  rendered from structured data (sponsor, prize, eligibility, jurisdiction exclusions,
  entry dates, judging criteria, tax note). A prize-bearing season cannot open without
  rules attached — DB constraint, same pattern as the license gate.
- Music licensing surface: every set piece publicly credits its track, artist and licensor.
  Admin sees license expiry warnings. An expired license auto-unpublishes the archive
  video, not just the live drop.
- DMCA: public takedown form, internal counter-notice workflow, repeat-infringer strike
  counter.
- Data export and account deletion (GDPR / India DPDP), including hard deletion of Mux
  assets.
- Guardian consent records for minors where required, and a per-region config module so I
  can disable features by jurisdiction.
- Cookie/analytics consent that actually blocks PostHog until consented.

Put every jurisdiction rule in ONE config module a lawyer can review in a single file.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 20 — Analytics

```
Read CLAUDE.md. Instrument around the questions I actually need answered.

Events: signup started/completed, first vote, 25th vote, unlock shown, unlock converted,
first entry, entry accepted/rejected, first rating, drop viewed, drop entered, vote cast
(with decision time), leaderboard viewed, rating explanation opened, rating card shared,
prediction made, challenge issued, season completed, week-2 return.

An /admin/metrics dashboard showing:
- THE ACTIVATION FUNNEL: signup -> first vote -> 25 votes -> unlock -> first entry.
  This is the most important funnel in the product.
- Supply ratio: live entries per category per week vs active fans. Our target is roughly
  1 entry per 5 fans; alert when we fall under, because the audience runs out of things
  to judge.
- Views per entry, and its distribution. Guaranteed attention is our core promise — if the
  bottom decile of entries is getting a fraction of the top decile, we are breaking it.
- Time from upload to provisional rating (p50/p95) — our key latency SLO.
- Week-1/2/4 retention split by fan vs competitor, and for competitors split by whether
  they won their division. If losing competitors churn hard, divisions aren't working.
- Drop participation rate per week (the ritual's health).
- Eligibility rejection rate and appeal overturn rate.
- Cost per entry and cost per active user.

Define every metric once, in one place, with a written definition so numbers can't drift.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

### Prompt 21 — Hardening and launch readiness

```
Read CLAUDE.md. Get this production-ready.

- Load-test the voting endpoint and leaderboard reads at 10x expected launch traffic.
- A simulation harness: 5,000 synthetic fans, 1,000 entries, 200,000 comparisons across an
  8-week season with weekly set pieces, run end to end. Output a report on rating
  distribution, promotion rates, division sizes, and views-per-entry spread, so I can sanity
  check that the numbers feel right before real humans see them.
- Full E2E Playwright coverage of the critical path: signup -> judge 25 -> unlock -> enter
  the drop -> eligibility -> provisional rating -> season close -> result card.
- Error boundaries, offline behaviour, PWA manifest and install prompt, Lighthouse pass,
  and a WCAG 2.1 AA audit including keyboard-only voting and captions on entry videos.
- A runbook in /docs covering: provider outage fallbacks (moderation API down = fail CLOSED
  to under_review, never fail open), rating rollback, missed-drop procedure, expired-license
  emergency takedown, and season-close incident handling.

When you're done, update PROGRESS.md: mark this prompt complete, list the files you
created or changed, record decisions and trade-offs, note anything you deliberately
deferred, and write the exact next step. Add new domain terms to the CLAUDE.md glossary.
If you made an architectural choice worth revisiting, add an entry to /docs/decisions/.
```

---

## Appendix — Design Direction (paste into Prompt 2)

### The thesis: broadcast, not feed

Every social app looks like a feed because every social app _is_ one. Arena is a tournament. Reference set: F1 timing graphics (dense data made legible), Olympic scoreboards (authority, restraint, ceremony), Chess.com and Strava (a number as identity, credibility through transparency), Apple Fitness rings (progress made physical). That set reads as **serious rather than teenage**, which is exactly how a 15-year-old and a 45-year-old classical dancer end up in the same product.

### How you actually get all age groups

1. **Typography-led, not illustration-led.** Illustration styles age-code hard. Confident type plus real video is ageless. One display face for numbers and results, one clean neutral for UI.
2. **No slang, no emoji in system copy.** "Season 3 closes Sunday · 4 days left" works at every age.
3. **Accessibility is age-inclusivity.** Dynamic type to 200%, AA contrast, 48px targets, captions, reduced motion. Usually filed as compliance; here it's the feature that lets a 60-year-old vocal coach use the same screen as a 15-year-old.
4. **Category theming.** A bharatanatyam competitor and a metal vocalist should not feel like they're in the same app. One accent ramp per category, swapped at the root.

### The four signature moments

1. **The blind reveal.** Two unnamed clips, you choose, the cards flip. This is where the user _feels_ the fairness. Give it weight, motion and sound.
2. **The scrub-sync compare.** Because everyone performed the same brief, a voter can scrub both clips to the same moment. No other platform can offer this. Make it a showpiece.
3. **The rating tick.** An odometer that settles with a small physical bounce; tap it for the plain-language explanation.
4. **The season result card.** Staged reveal — position, then delta, then badge — ending in a beautiful shareable artifact. Retention moment and growth channel in one.

### Deliberately not doing

No infinite scroll — sessions are bounded and purposeful. No red-dot spam, no manipulative streaks, no "your rank is dropping!" panic. No neon gamer aesthetic; it excludes anyone over 30 and cheapens the credential. No cutesy over-gamification — ceremony should be rare and earned. No dark-mode-only; older users overwhelmingly prefer light. No dense desktop-first layouts — one-handed, thumb-zone, bottom-anchored actions.

### Layout principles

**Video is the color** — near-monochrome chrome so performances carry the energy, which also stops a loud UI from amplifying inconsistent user footage. **Numbers are typographic events** — tabular figures, generous size, precise alignment; that's what makes data feel authoritative. **Whitespace as confidence** — dense screens read as cheap, and sparseness is what signals "this ranking means something." **Every stat is tappable** and opens its explanation: transparency as an interaction pattern, not a policy page.

---

## How to run this well

**Mechanically:** one prompt per Claude Code session (or at least per turn), in order. Paste everything inside the fenced block, nothing else. Don't batch two prompts together — each one ends by writing `PROGRESS.md`, and that log is what lets you stop, close your laptop, and pick up cleanly a week later.

**Prompts 0 and 1 are non-negotiable prerequisites.** Prompt 0 creates `CLAUDE.md`, which every later prompt begins by reading. Prompt 1 creates the seed data that Prompts 5–7 are built against. Skip either and everything after it drifts.

- After every prompt, ask: _"What did you assume that I didn't tell you? What did you skip? What's the weakest part of what you just wrote?"_ This catches more than any review step.
- **Prompts 5, 6, 10 and 14 are the product.** Blind voting, the unlock, the rating engine, and integrity. If you only get four right, make it those.
- Ship Phases 0–2 before touching Phase 4. A working core loop with 50 real users teaches you more than a complete feature set with zero.
- Commit `CLAUDE.md`, `PROGRESS.md` and `/docs/decisions/` every session. They're the project's memory and worth more than the code if you ever restart.
- **Still unresolved and not solvable in code:** what winning actually gets someone in week one, legally, in your launch market. Answer it before Phase 4.
