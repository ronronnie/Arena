import 'server-only';

import { cache } from 'react';
import { getOnboardingState, getProfile, type OnboardingState, type OwnProfile } from '@/lib/db';
import { currentActor } from './actor';
import type { Actor } from '@/lib/db';

/**
 * The server-side session helpers. `getSessionUser()` is the one the prompt pack asks for.
 *
 * Everything here is wrapped in React's `cache`, so a page that needs the actor, the
 * profile and the onboarding state renders them from one round trip rather than three.
 * Without it, a layout and two server components asking the same question each pay for it
 * — and on Neon's HTTP driver every question is a network hop.
 */

/** The actor for this request. Anonymous when there is no session. */
export const getActor = cache(async (): Promise<Actor> => currentActor());

export type SessionUser = {
  id: string;
  isMinor: boolean;
  profile: OwnProfile | null;
  onboarding: OnboardingState;
};

/**
 * The signed-in user, or null.
 *
 * Returns null rather than throwing, because "is anyone signed in" is a question a public
 * page is allowed to ask. Routes that REQUIRE a user should call `requireSessionUser`.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const actor = await getActor();
  if (actor.kind !== 'user') return null;

  const [profile, onboarding] = await Promise.all([
    getProfile(actor, actor.id),
    getOnboardingState(actor),
  ]);

  return { id: actor.id, isMinor: actor.isMinor, profile, onboarding };
});

/** For a route that has no meaning without a user. Throws rather than returning null. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user === null) throw new Error('This route requires a signed-in user');
  return user;
}
