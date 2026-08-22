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

  return { kind: 'user', id: user.id, isMinor: await resolveIsMinor(user.id) };
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
