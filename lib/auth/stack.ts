import 'server-only';

import { StackServerApp } from '@stackframe/stack';

/**
 * Neon Auth (Stack) server app.
 *
 * Identity lives here; Arena's own profile data lives in Postgres and hangs off the
 * `neon_auth.users_sync` table Neon keeps in sync for us. We do not duplicate identity.
 *
 * Core rule 4 — AUDIENCE-FIRST. There is no "sign up as a competitor" path. Everyone who
 * signs up is a judge; competing is unlocked later. Prompt 3 builds the onboarding that
 * enforces this. Nothing here should ever offer a role choice at signup.
 *
 * Constructed lazily and memoised. Building it at module scope would make a missing
 * credential a *build* failure rather than a request-time one, which breaks CI and
 * preview builds for anyone who hasn't got the secrets yet. Same reasoning as
 * `lib/db/env.ts`: fail loudly, but fail when someone actually asks.
 */
function build() {
  return new StackServerApp({
    tokenStore: 'nextjs-cookie',
    urls: {
      // Post-auth destination is the judging surface, not a profile. See Core rule 4.
      afterSignIn: '/',
      afterSignUp: '/',
      afterSignOut: '/',
    },
  });
}

let app: ReturnType<typeof build> | undefined;

export function getStackServerApp() {
  app ??= build();
  return app;
}
