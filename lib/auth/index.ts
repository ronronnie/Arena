import 'server-only';

import { createNeonAuth } from '@neondatabase/auth/next/server';
import { neonAuthBaseUrl, neonAuthCookieSecret } from './env';

/**
 * Neon Auth — the server half.
 *
 * Neon Auth is a hosted Better Auth instance. Identity lives in the `neon_auth` schema
 * of our own Neon database (`user`, `session`, `account`, `verification`, `organization`,
 * `member`, `invitation`, `jwks`), which means profile joins are SQL rather than network
 * calls. We never duplicate identity into an Arena table — the Arena profile hangs off
 * `neon_auth.user`.
 *
 * Core rule 4 — AUDIENCE-FIRST. There is no "sign up as a competitor" path. Everyone who
 * signs up is a judge; competing is unlocked after UNLOCK_THRESHOLD comparisons. Prompt 3
 * builds the onboarding that enforces this. Nothing here may ever offer a role at signup.
 *
 * Constructed lazily and memoised: building at module scope would turn a missing
 * credential into a *build* failure rather than a request-time one. Same reasoning as
 * `lib/db/env.ts`.
 */
function build() {
  return createNeonAuth({
    baseUrl: neonAuthBaseUrl(),
    cookies: { secret: neonAuthCookieSecret() },
  });
}

let instance: ReturnType<typeof build> | undefined;

export function auth() {
  instance ??= build();
  return instance;
}
