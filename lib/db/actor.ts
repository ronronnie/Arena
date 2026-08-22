/**
 * Who is asking.
 *
 * Every data-access function takes an Actor. There is no implicit "current user" and no
 * default — you must state, at the call site, on whose authority a query runs. That
 * explicitness is what replaces row-level security after the move from Supabase to Neon.
 *
 * This file is framework-free on purpose: the rules about who may read what are domain
 * rules, and they should be unit-testable without a request in scope.
 */

/** A signed-in human. `id` is the Neon Auth user id (`neon_auth.user.id`). */
export type UserActor = {
  kind: 'user';
  id: string;
  /**
   * Core rule 7. Assume minors. Anything that opens a contact surface, reveals location,
   * or exposes personal data must branch on this rather than hoping it never comes up.
   */
  isMinor: boolean;
  /**
   * Runs the drops: writes briefs, licenses tracks, publishes.
   *
   * Deliberately NOT the same thing as a `system` actor. The system acts with no human
   * behind it and states a reason for the audit log; an admin is a person, and a person
   * publishing an unlicensed brief is somebody we need to be able to name afterwards.
   */
  isAdmin: boolean;
};

/** Nobody is signed in. Public reads only, and never anything personal. */
export type AnonymousActor = { kind: 'anonymous' };

/**
 * Trusted server work: Inngest jobs, seeds, moderation tooling, rating recomputation.
 * Bypasses user-scoped checks, so it must never be constructed from a request.
 * `reason` is required and is meant to end up in the moderation audit log.
 */
export type SystemActor = { kind: 'system'; reason: string };

export type Actor = UserActor | AnonymousActor | SystemActor;

export const anonymous = (): AnonymousActor => ({ kind: 'anonymous' });

export const system = (reason: string): SystemActor => ({ kind: 'system', reason });

export function isUser(actor: Actor): actor is UserActor {
  return actor.kind === 'user';
}

export function isSystem(actor: Actor): actor is SystemActor {
  return actor.kind === 'system';
}

/** Thrown when an actor asks for something it has no business seeing. */
export class ForbiddenError extends Error {
  constructor(what: string) {
    super(`Forbidden: ${what}`);
    this.name = 'ForbiddenError';
  }
}

/**
 * Assert the actor is a signed-in user and return it narrowed.
 * Use at the top of any query touching personal data.
 */
export function requireUser(actor: Actor, what: string): UserActor {
  if (!isUser(actor)) {
    throw new ForbiddenError(`${what} requires a signed-in user`);
  }
  return actor;
}

/**
 * Assert the actor may run the drops.
 *
 * Accepts the system too, because scheduled lifecycle jobs move the same rows an admin
 * does. What it does not accept is an ordinary signed-in user, however the request got
 * here — a hidden nav link is not a permission.
 */
export function requireAdmin(actor: Actor, what: string): void {
  if (isSystem(actor)) return;
  if (isUser(actor) && actor.isAdmin) return;
  throw new ForbiddenError(`${what} requires an administrator`);
}

/** Assert the actor is the named user, or the system. Ownership checks go through this. */
export function requireSelfOrSystem(actor: Actor, userId: string, what: string): void {
  if (isSystem(actor)) return;
  if (isUser(actor) && actor.id === userId) return;
  throw new ForbiddenError(what);
}
