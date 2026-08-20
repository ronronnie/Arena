import 'server-only';

/**
 * The data-access layer. The ONLY way into the database from the rest of the app.
 *
 * Nothing outside /lib/db may import ./client — an ESLint rule enforces it. Add query
 * functions under /lib/db/queries and re-export them here. Every one of them takes an
 * `Actor` as its first argument and is responsible for its own authorization.
 *
 * Prompt 1 fills this in. It is deliberately empty rather than absent, so the shape of
 * the rule is visible from the first commit.
 */

export type { Actor, AnonymousActor, SystemActor, UserActor } from './actor';
export {
  ForbiddenError,
  anonymous,
  isSystem,
  isUser,
  requireSelfOrSystem,
  requireUser,
  system,
} from './actor';
