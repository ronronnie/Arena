# 0001 — Stack choice

- **Status:** Accepted, partly superseded
- **Date:** 2026-08-20
- **Context:** Prompt 0
- **Superseded by:** [0002](./0002-neon-drizzle-neon-auth.md) on auth — the table below
  describes Neon Auth as Stack Auth syncing into `neon_auth.users_sync`. That was wrong.
  Neon Auth is a hosted Better Auth instance and the identity table is `neon_auth.user`.
  Left unedited as the historical record; read 0002 for what is true.
  Also amended by [0003](./0003-next-16.md) on the Next.js version.

## Context

Arena is a web-first PWA built around a weekly ritual: a brief drops, competitors enter,
the audience votes blind on pairs, ratings move, a season ends in promotion and
relegation. The load is spiky and scheduled rather than continuous — most of the work
happens in bursts around a drop. Sessions are short and mobile-first by design
(Core rule 8). The audience is the market, so the voting surface has to feel expensive.

Constraints that shaped the choice:

- A solo/small team. Anything requiring dedicated infrastructure attention is a tax paid
  every week against the thing that actually matters — the ritual.
- Users may be minors (Core rule 7), so authorization is a first-order concern, not a
  later hardening pass.
- Scheduled, idempotent background work (drop lifecycle, rating recomputation, season
  rollover) is core product mechanics, not a side feature.
- Video is the product's raw material, and entries must stay private until a drop opens.

## Decision

| Layer         | Choice                                   | Why                                                                                                                                                                   |
| ------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework     | Next.js 15 App Router, TypeScript strict | Server Components keep the blind-voting surface's data on the server, where Core rule 3 can actually be enforced. One deploy target.                                  |
| Styling       | Tailwind v4 + shadcn/ui                  | Owned components rather than a dependency. The design direction is opinionated and typography-led; a themeable component library we can edit beats one we must fight. |
| Database      | Neon Postgres                            | Serverless Postgres with scale-to-zero, which matches spiky drop-shaped load. Branching gives a real database per preview deploy.                                     |
| ORM           | Drizzle                                  | SQL-shaped, fully typed, no runtime magic. The pairing and rating queries get gnarly; an ORM that hides SQL would be a liability.                                     |
| Auth          | Neon Auth (Stack)                        | Users sync into `neon_auth.users_sync` inside our own Postgres, so identity joins in SQL instead of over a network call.                                              |
| Storage       | Vercel Blob                              | Avatars, thumbnails, result cards. Same platform as the deploy target.                                                                                                |
| Video         | Mux                                      | Signed playback URLs, per-entry policy. Entries stay private until a drop opens — that is a product rule, and Mux enforces it at the CDN.                             |
| Jobs          | Inngest                                  | Durable, retryable, idempotent scheduled functions. The drop lifecycle is the product's heartbeat; it cannot depend on a cron that silently failed.                   |
| Rate limiting | Upstash Redis                            | Vote integrity needs per-user, per-IP, per-window counters at the edge.                                                                                               |
| Hosting       | Vercel                                   |                                                                                                                                                                       |
| Analytics     | PostHog + Sentry                         | Sessions-per-week and entries-per-season are the metrics (Core rule 8); PostHog measures funnels rather than attention time.                                          |
| Unit tests    | Vitest                                   | Domain logic in `/lib` is framework-free and must be testable without a browser.                                                                                      |
| E2E tests     | Playwright                               | Mobile viewport project runs first — mobile is the primary target, not an afterthought.                                                                               |

The original prompt pack specified **Supabase** for database, auth, RLS, and storage.
That was changed during Prompt 0 to Neon + Drizzle + Neon Auth + Vercel Blob. The
reasoning and, more importantly, the consequences for Core rule 7 are recorded
separately in [0002](./0002-neon-drizzle-stack-auth.md).

## Consequences

**Good**

- One vendor for database and auth, with identity queryable in SQL alongside domain data.
- Neon branching gives preview deploys real, isolated data — which matters a lot when
  the seed data is the thing Prompts 5–7 are built against.
- Drizzle keeps the rating and pairing queries legible as SQL.
- `/lib` is framework-free and lint-enforced, so Glicko-2 and eligibility rules can be
  tested as pure functions.

**Costs**

- Losing Supabase means losing row-level security as a database-level guarantee. This is
  the single largest cost of the stack and is addressed in 0002.
- More moving parts than an all-in-one backend: Neon, Stack, Blob, Mux, Inngest, Upstash
  are six dashboards and six sets of credentials.
- Neon's HTTP driver does not support interactive transactions. Anything needing a real
  transaction (season rollover, rating batch writes) must use the WebSocket/pooled driver.
  Prompt 10 and Prompt 11 will hit this.

**Revisit if**

- The offline season (see the prompt pack's pre-work) shows the ritual doesn't hold, in
  which case none of this matters yet.
- Rating recomputation outgrows Inngest's execution limits.
- The data-access layer described in 0002 shows cracks in review — at which point Neon
  RLS with JWT-scoped policies becomes the fallback.
