import { auth } from '@/lib/auth';

/**
 * Neon Auth proxy. The client SDK talks to this route, which forwards to the hosted
 * Neon Auth instance and exchanges its response for a session cookie signed with our
 * own NEON_AUTH_COOKIE_SECRET.
 *
 * Proxying rather than calling Neon directly from the browser is what keeps the session
 * cookie first-party and HttpOnly.
 *
 * The handler is resolved per request, not at module scope. `export const { GET, POST } =
 * auth().handler()` reads more nicely but runs `auth()` at import time, which defeats the
 * lazy construction in `lib/auth` and makes `next build` fail on any machine without
 * NEON_AUTH_BASE_URL set — CI and preview builds included.
 */

type Handlers = ReturnType<ReturnType<typeof auth>['handler']>;

let handlers: Handlers | undefined;
const resolve = (): Handlers => (handlers ??= auth().handler());

export const GET = (...args: Parameters<Handlers['GET']>): ReturnType<Handlers['GET']> =>
  resolve().GET(...args);

export const POST = (...args: Parameters<Handlers['POST']>): ReturnType<Handlers['POST']> =>
  resolve().POST(...args);
