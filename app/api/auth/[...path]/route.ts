import { auth } from '@/lib/auth';

/**
 * Neon Auth proxy. The client SDK talks to this route, which forwards to the hosted
 * Neon Auth instance and exchanges its response for a session cookie signed with our
 * own NEON_AUTH_COOKIE_SECRET.
 *
 * Proxying rather than calling Neon directly from the browser is what keeps the session
 * cookie first-party and HttpOnly.
 */
export const { GET, POST } = auth().handler();
