# 0004 — Two lanes, two tables; and Core rule 3 as a database object

- **Status:** Accepted
- **Date:** 2026-08-22
- **Context:** Prompt 1
- **Diverges from:** the prompt pack's `entries` table

## Context

The prompt pack models both lanes in one table:

```
entries (user_id, season_id, category_id, lane enum('set_piece','signature'),
         set_piece_id nullable, ...)
CONSTRAINT: lane='set_piece' requires set_piece_id NOT NULL;
            lane='signature' requires set_piece_id IS NULL.
```

That is a reasonable, normal schema. It is also one `WHERE` clause away from breaking the
rule the product is built on.

Core rule 1 says set piece state and signature state must be separated **structurally,
not just by convention**. With a single table, the thing keeping freeform work out of the
rating system is that every rating query remembers to say `WHERE lane = 'set_piece'`.
Prompts 9 through 13 — eligibility, rating, divisions, leaderboards, judge panel — are
several hundred lines of aggregate queries over exactly this table. One of them forgetting
that clause does not throw. It silently rates someone's warm-up video, and the symptom
shows up weeks later as a leaderboard nobody can explain.

The same argument applies to Core rule 3. Blind voting works only if a competitor's
identity is unreachable before a vote. In a single-table model, `user_id` sits on the row
the voting screen is already reading, and what protects the rule is that the select list
never mentions it.

Both cases have the same shape: a rule the whole product depends on, defended by
remembering something at every call site, forever.

## Decision

**1. Two tables: `set_piece_entries` and `signature_entries`.**

`comparisons` has foreign keys to `set_piece_entries` only. A signature entry reaching the
rating system is now a foreign-key error, not a bad afternoon. `signature_entries` has no
`season_id`, no `set_piece_id`, and nothing a rating query could join through — the
absence is the enforcement.

**2. A `set_piece_entry_blind` view with no `user_id` column.**

The voting path reads the view; nothing else does. Identity is not filtered out of it, or
hidden in it — the column does not exist, so a blind query cannot leak it by selecting one
column too many. The view also contains only `status = 'eligible'` rows, so an entry still
processing cannot be shown to a voter. The reveal is a separate call
(`revealComparison`) that refuses until a vote is recorded.

**3. "Both entries are on the same brief" is a foreign key, not a trigger.**

`set_piece_entries` carries a composite unique constraint on `(id, set_piece_id)`, and
`comparisons` has composite foreign keys `(entry_a, set_piece_id)` and
`(entry_b, set_piece_id)` pointing at it. Postgres refuses a cross-brief pair outright.
Only the two rules that genuinely need a lookup — the licence window and "a voter is never
shown their own entry" — are triggers.

**4. `is_minor` is derived, not stored.**

The pack lists it as a column on `profiles`. A stored flag is correct the day it is
written and wrong the morning after a birthday, and being wrong for up to a year about
whether a user is a child is not a defect worth the denormalisation. `dob` is stored;
`lib/domain/age.ts` derives the answer, and treats an unknown date of birth as a minor.

## Consequences

**Good**

- The two lanes cannot contaminate each other by omission. Core rules 1 and 2 survive
  authors who have not read this file.
- A blind-path identity leak requires deliberately changing the view, which shows up in a
  migration diff rather than in a select list.
- The cross-brief guarantee costs nothing at write time and cannot be bypassed by a seed,
  a job, or psql.

**Costs — stated plainly**

- **Duplication.** Roughly eight columns (video source, status, duration, timestamps)
  exist in both entry tables. A change to how video is referenced is now two changes.
- **No single "all my entries" query.** A profile showing both lanes reads both tables and
  merges in application code. That is the intended friction, but it is friction.
- **Polymorphic moderation.** `reports` and `moderation_actions` need a nullable column per
  lane plus a CHECK that exactly one is set, where one table would have needed one column.
- Every later prompt that says "the entries table" now has to pick a lane. Read it as
  `set_piece_entries` unless it is explicitly about signature work.

**Revisit if**

- The duplication drifts — the two tables' video columns diverging accidentally would be a
  real sign this is costing more than it protects.
- A product decision ever makes signature work affect rating. That would be a change to
  Core rules 1 and 2 and needs its own ADR first; this schema would then be the wrong
  shape, deliberately.

## Note on the licensing trigger

The pack asks for the licence-window rule to be "enforced with a trigger, not application
code", and that survives the move to Neon unchanged — Neon is Postgres. It is worth being
explicit about why it stays in the database while authorization moved out of it (ADR
0002): authorization is per-actor and needs to know who is asking, which the database no
longer knows once we stopped using RLS. A licence window is a fact about a row. It holds
regardless of who is writing, which makes a trigger both possible and correct — and means
it still holds for writes from a seed, an Inngest job, Drizzle Studio, or a future admin
tool, none of which go through our data-access layer.
