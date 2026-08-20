# Inngest functions

Background and scheduled work. Nothing here yet — the folder exists so the boundary is
visible from the first commit.

What lands here, and when:

| Prompt | Function                                                                            |
| ------ | ----------------------------------------------------------------------------------- |
| 4      | Weekly drop lifecycle — open the brief, close entries, open voting, publish results |
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
