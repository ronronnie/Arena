# Queries

One file per aggregate (`entries.ts`, `comparisons.ts`, `ratings.ts`, `divisions.ts`, …).

Every exported function follows the same contract:

```ts
export async function getSomething(actor: Actor, input: Input): Promise<Output>;
```

1. **Actor first, always.** No implicit current user. The caller states whose authority
   the query runs on.
2. **Authorize before you query.** Call `requireUser` / `requireSelfOrSystem` at the top,
   or explain in a comment why the data is genuinely public.
3. **Never widen a select to "everything".** Return the columns the caller needs. Core
   rule 3 dies quietly the first time an entry row arrives with a `user_id` attached to
   it during a blind vote.
4. **Test the authorization, not just the result.** Every query touching personal data
   needs a test proving the wrong actor gets a `ForbiddenError`.

This layer is the replacement for the row-level security we gave up by moving off
Supabase. It only works if it has no exceptions — see `/docs/decisions/0002-neon-drizzle-stack-auth.md`.
