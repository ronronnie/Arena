'use client';

import { createAuthClient } from '@neondatabase/auth/next';

/**
 * Neon Auth — the browser half. Talks to our own /api/auth proxy, never to Neon directly,
 * so the session cookie stays first-party and HttpOnly.
 *
 * Sign-in and sign-up SCREENS are Prompt 3, and they are not generic: Core rule 4 means
 * onboarding puts a new user straight into judging, with no role choice anywhere.
 */
export const authClient = createAuthClient();
