# Inngest functions

Background and scheduled work.

**Nothing in the product's correctness depends on these having run.** A drop's phase is
derived from the clock (`lib/domain/dropLifecycle.ts`, ADR 0007), so a sweep that never
fires cannot make a screen claim entries are open after the deadline. What these drive is
everything that has to _happen_ at a boundary: events, and from Prompt 10, ratings.

They are crons, so they need the Inngest dev server locally:

```bash
npx inngest-cli@latest dev   # then the app at http://localhost:3000/api/inngest
```

What lands here, and when:

| Prompt | Function                                                                            |
| ------ | ----------------------------------------------------------------------------------- |
| 4      | `drop-lifecycle` (15 min sweep) and `drop-guard` (daily missed-drop warning) — DONE |
| 10     | Glicko-2 rating recomputation after a voting window closes                          |
| 11     | Season rollover: promotion, relegation, division rebalancing                        |
| 14     | Vote-integrity sweeps — collusion and brigading detection                           |
| 18     | Notification fan-out                                                                |

Rules for anything in this folder:

- Functions run as a `system` actor with a stated reason (`@/lib/db` → `system('...')`).
  They bypass user-scoped authorization, so the reason ends up in the audit log.
- Functions must be idempotent. Drops and seasons are the product's heartbeat; a retry
  must never double-promote someone or recount a vote.
- No function may write to both a rating and a following count. Core rule 1 — the lanes
  do not touch.
- **Anything returned from `step.run()` has been through JSON.** Inngest memoises step
  results so a retry can skip completed work, which means `Date` goes in and an ISO string
  comes out. Use `inngest/revive.ts` at that boundary rather than trusting the type.
- Events are past tense and describe something that already happened. Two of the drop
  events are edge detections rather than state changes, so they are at-least-once — see
  `functions/drop-lifecycle.ts`.
