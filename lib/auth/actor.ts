import 'server-only';

import { anonymous, system, type Actor } from '@/lib/db/actor';
import { getProfile } from '@/lib/db';
import { isMinor } from '@/lib/policy/minorPolicy';
import { auth } from './index';

/**
 * Bridge between Neon Auth and the framework-free actor model.
 *
 * This is the ONLY place that turns "there is a request with a session cookie" into an
 * `Actor`. Everything downstream reasons about actors, not sessions, which is what keeps
 * the authorization rules unit-testable without a request in scope.
 */
export async function currentActor(): Promise<Actor> {
  const { data } = await auth().getSession();
  const user = data?.user;
  if (!user) return anonymous();

  return {
    kind: 'user',
    id: user.id,
    isMinor: await resolveIsMinor(user.id),
    isAdmin: isAdminIdentity(user),
  };
}

/**
 * Who may run the drops.
 *
 * Two sources, and the second is a bootstrap. Neon Auth's Better Auth instance has a
 * `role` column on `neon_auth.user` — but nothing in Arena can write to it yet, and a
 * product where nobody can publish the first brief is not a product. So an email
 * allowlist in `ARENA_ADMIN_EMAILS` also grants it.
 *
 * The allowlist is deliberately an environment variable rather than a database flag:
 * changing who is an administrator should require a deploy, not a row update, until there
 * is an audited way to grant it. Prompt 15 builds the moderation console and should
 * replace this with something reviewable.
 */
function isAdminIdentity(user: {
  email?: string | null | undefined;
  role?: string | null | undefined;
}): boolean {
  if (user.role === 'admin') return true;

  const allowlist = (process.env.ARENA_ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '');

  const email = user.email?.toLowerCase();
  return email !== undefined && email !== null && allowlist.includes(email);
}

/**
 * Core rule 7, resolved from the stored date of birth.
 *
 * Until Prompt 3 this returned a hardcoded `true`. It now reads the profile — but the
 * three failure modes all still answer `true`, and that is the point of writing it out
 * rather than collapsing it into one expression:
 *
 *   - no profile yet (mid-onboarding)      -> minor
 *   - profile with no date of birth        -> minor, via `isMinor(null)`
 *   - the lookup threw                     -> minor
 *
 * A caching or database problem must not be able to promote a fifteen-year-old to an
 * adult surface. The safe answer is the same in every direction we do not understand.
 *
 * The read costs one query per request that needs an actor. `lib/auth/session.ts` wraps
 * the whole path in React's `cache`, so it is once per render, not once per caller.
 */
async function resolveIsMinor(userId: string): Promise<boolean> {
  try {
    /*
     * A `system()` actor, with a stated reason. The user's own actor cannot be used here
     * because it is precisely what this function is in the middle of constructing, and
     * `getProfile` requires one — the alternative would be an unauthorised read, which is
     * the exception the data-access layer is not allowed to have.
     */
    const profile = await getProfile(system('resolving age band to build an actor'), userId);
    return isMinor(profile?.dob ?? null);
  } catch {
    return true;
  }
}
