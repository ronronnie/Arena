import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route protection.
 *
 * **This file is `proxy.ts`, not `middleware.ts`.** Next 16 deprecated the `middleware`
 * file convention and renamed it — see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
 * The prompt pack says "middleware for protected routes"; this is that, under its current
 * name.
 *
 * It does exactly one thing: if there is no session cookie, send the request to sign-in.
 * It deliberately does NOT decide where a signed-in user should go next.
 *
 * That restraint matters. Working out whether onboarding is finished means reading the
 * profile, and Next's docs are explicit that proxy code runs separately from render code
 * and may be deployed to the CDN — so a database read here is both wrong and slow, on
 * every request. The onboarding redirect lives in `app/(app)/layout.tsx`, where the
 * session and profile are already loaded and cached for the render that follows.
 *
 * So: the proxy answers "is anyone signed in", the layout answers "are they ready".
 */

/**
 * The presence of a session cookie is a hint, not proof.
 *
 * A forged or expired cookie gets past this and is then rejected properly by
 * `currentActor()`, which verifies it. Treating the cookie as authentication here would
 * be a real hole; treating it as "worth rendering the page for" is just routing.
 */
const SESSION_COOKIE_PREFIXES = ['neon-auth', 'better-auth', '__Secure-neon-auth'];

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => SESSION_COOKIE_PREFIXES.some((prefix) => cookie.name.startsWith(prefix)));
}

export function proxy(request: NextRequest): NextResponse {
  if (hasSessionCookie(request)) return NextResponse.next();

  const signIn = new URL('/sign-in', request.url);
  // So the user lands where they were going, once they are in.
  signIn.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = {
  /*
   * Only the routes that need a user.
   *
   * Everything else — the landing page, a public profile, a brief, the design system — is
   * readable signed-out on purpose. Core rule 4 is audience-first, and an audience product
   * that demands an account before showing anything has the funnel backwards.
   */
  matcher: ['/onboarding/:path*', '/vote/:path*', '/settings/:path*'],
};
