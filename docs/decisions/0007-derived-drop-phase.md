# 0007 — The drop phase is derived, not stored

- **Status:** Accepted
- **Date:** 2026-08-22
- **Context:** Prompt 4

## Context

A drop moves through states: announced, open for entries, entries closed and judging,
results. The obvious implementation is a `status` column advanced by a scheduled job.

`set_pieces.status` already exists (`draft` / `scheduled` / `published` / `closed` /
`archived`), and Prompt 4 adds the Inngest functions to drive it. The question was whether
the SCREENS should read that column.

They should not, and the reason is a failure mode rather than a preference. If the phase
is a stored value, then every screen is only as correct as the last cron run. Inngest goes
down for an hour, or a deploy misses a schedule, or a function throws on one row — and the
product tells a competitor that entries are open ninety minutes after the deadline. They
record, they submit, and they are rejected by an eligibility check for being late to a
deadline the app itself hid from them.

That is not an edge case. It is the ordinary consequence of a job not running, and jobs do
not run all the time.

## Decision

**`status` is what somebody decided. `phase` is what is happening, derived from the clock.**

`lib/domain/dropLifecycle.ts` computes the phase from `status` plus the three timestamps,
and every surface reads it from there. Nothing renders `status` to a user except the admin
screen, where "this is a draft" is exactly the fact an administrator needs.

Consequences that fall out of this:

- **The scheduled functions cannot make the product lie.** The worst a missed sweep can do
  is delay an event — a notification, or from Prompt 10 a rating recomputation. The screens
  are already correct.
- **`nextTransition` returns one step or null**, rather than the status a drop "ought" to
  have. That is what makes the sweep idempotent: run it twice and the second run finds
  nothing. A function that computed a target state would happily overwrite a row an admin
  had just archived by hand.
- **Boundaries are half-open**, `[opensAt, submitBy)`. A brief that says "closes at 18:00"
  does not accept an entry at 18:00:00.000. Every edge is pinned by a test.

## The sweep, and at-least-once events

`drop/opened` and `drop/entries.closed` are **edge detections**, not state changes — a
brief's status stays `published` through both. The sweep emits them when the boundary
falls inside the last fifteen minutes, so a double run inside one window emits twice.
Subscribers must be idempotent, which was already the rule in `inngest/README.md`.

`drop/judging.closed` is different: it accompanies a real status change, and
`advanceSetPieceStatus` matches on the current status, so a retry updates nothing and no
event is sent.

A sweep was chosen over per-drop timers deliberately. A timer per brief is more elegant
and more fragile — it has to be created on publish, moved when a date is edited, and
cancelled on unpublish, and every one of those going wrong is silent. A sweep re-derives
everything from the rows each time.

## Consequences

**Good**

- Correctness does not depend on infrastructure that is allowed to fail.
- The lifecycle is a pure function, so 34 tests cover it with no database and no clock
  mocking beyond passing `now`.
- `/drop` renders every phase honestly with no job having ever run — which is exactly how
  it behaves in development, where no Inngest dev server is attached.

**Costs — stated plainly**

- Two representations of nearly the same thing, and a reader has to learn which is which.
  The naming carries the whole distinction, so it needs to survive.
- Phase cannot be queried in SQL. "Every brief currently judging" is a scan plus a filter
  in TypeScript. Fine at this size; at a thousand categories it would want a generated
  column or an index on the timestamps.
- A brief whose window is edited changes phase instantly, with no record that it did.

**Revisit if**

- A surface genuinely needs to filter by phase in SQL at scale.
- The number of derived-vs-stored disagreements in the admin screen becomes confusing
  enough that administrators stop trusting either.

## A related note on `step.run`

Anything returned from an Inngest `step.run()` goes through JSON, because Inngest memoises
step results so a retry can skip completed work. A `Date` goes in and an ISO string comes
out. TypeScript catches it (`JsonifyObject<…>`), which is the only reason it surfaced here
rather than as `dropPhase()` silently comparing a string to a number.

`inngest/revive.ts` converts at that boundary. The data-access layer keeps returning
`Date`s, because that is correct for every other caller.
