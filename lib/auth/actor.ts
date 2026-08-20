import 'server-only';

import { anonymous, type Actor } from '@/lib/db/actor';
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
    /*
     * Core rule 7: assume minors until proven otherwise. Neon Auth stores identity, not
     * age — date of birth is collected in onboarding (Prompt 3) and lives on the Arena
     * profile. Until that exists the safe default is the restrictive one, because the
     * cost of guessing wrong is asymmetric and only one direction is acceptable.
     */
    isMinor: true,
  };
}
