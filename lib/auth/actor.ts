import 'server-only';

import { anonymous, type Actor } from '@/lib/db/actor';
import { getStackServerApp } from './stack';

/**
 * Bridge between the auth provider and the framework-free actor model.
 *
 * This is the ONLY place that turns "there is a request with a session cookie" into an
 * `Actor`. Everything downstream reasons about actors, not sessions, which is what keeps
 * the authorization rules unit-testable without a request in scope.
 */
export async function currentActor(): Promise<Actor> {
  const user = await getStackServerApp().getUser();
  if (!user) return anonymous();

  return {
    kind: 'user',
    id: user.id,
    /*
     * Core rule 7: assume minors until proven otherwise. Date of birth is collected in
     * onboarding (Prompt 3) and stored on the Arena profile, not on the auth record.
     * Until that exists, the safe default is the restrictive one.
     */
    isMinor: true,
  };
}
