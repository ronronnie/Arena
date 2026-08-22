/**
 * Profile queries.
 *
 * This is the file where Core rule 7 is either honoured or quietly broken, so the split
 * below is deliberate and load-bearing:
 *
 *   - `getPublicProfile` returns the handful of columns anyone may see. It names every
 *     one of them. It cannot return a date of birth, a city, or an email, because those
 *     columns are not in the select list and there is no `select *` here to widen.
 *   - `getProfile` returns personal data and is gated on `requireSelfOrSystem`.
 *
 * Under Supabase, a missing filter returned zero rows. Here it would return everyone's.
 */

import { and, eq, sql } from 'drizzle-orm';
import { UNLOCK_THRESHOLD } from '@/lib/config/hypotheses';
import { isValidHandle, normaliseHandle } from '@/lib/domain/handle';
import { assessAge, isMinor, signupRefusalMessage } from '@/lib/policy/minorPolicy';
import { type Actor, ForbiddenError, requireSelfOrSystem, requireUser } from '../actor';
import { db } from '../client';
import { profiles } from '../schema';

/** What anyone may see about a competitor. No PII. */
export type PublicProfile = {
  userId: string;
  displayName: string;
  handle: string;
  isCompetitor: boolean;
};

/** What you may see about yourself. */
export type OwnProfile = PublicProfile & {
  dob: string | null;
  country: string | null;
  city: string | null;
  isMinor: boolean;
  phoneVerified: boolean;
  primaryCategoryId: string | null;
  onboardingCompletedAt: Date | null;
  comparisonsCompleted: number;
  competeUnlockedAt: Date | null;
  createdAt: Date;
};

/**
 * Where a user is in the onboarding sequence.
 *
 * Read on every protected request, so it selects four columns and nothing else. The order
 * of the booleans is the order of the steps, and `proxy.ts` sends the user to the first
 * one that is still outstanding.
 */
export type OnboardingState = {
  hasProfile: boolean;
  needsDateOfBirth: boolean;
  needsCategory: boolean;
  needsIdentity: boolean;
  isComplete: boolean;
};

/**
 * Public by design: a display name and a handle are what a profile page is for, and the
 * reveal after a vote needs them. Every other column stays behind `getProfile`.
 */
export async function getPublicProfile(
  _actor: Actor,
  userId: string,
): Promise<PublicProfile | null> {
  const rows = await db
    .select({
      userId: profiles.userId,
      displayName: profiles.displayName,
      handle: profiles.handle,
      competeUnlockedAt: profiles.competeUnlockedAt,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  return {
    userId: row.userId,
    displayName: row.displayName,
    handle: row.handle,
    isCompetitor: row.competeUnlockedAt !== null,
  };
}

/** Personal data. The actor must BE this user, or be the system. */
export async function getProfile(actor: Actor, userId: string): Promise<OwnProfile | null> {
  requireSelfOrSystem(actor, userId, 'read another user’s profile');

  const rows = await db
    .select({
      userId: profiles.userId,
      displayName: profiles.displayName,
      handle: profiles.handle,
      dob: profiles.dob,
      country: profiles.country,
      city: profiles.city,
      phoneVerified: profiles.phoneVerified,
      primaryCategoryId: profiles.primaryCategoryId,
      onboardingCompletedAt: profiles.onboardingCompletedAt,
      comparisonsCompleted: profiles.comparisonsCompleted,
      competeUnlockedAt: profiles.competeUnlockedAt,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  return {
    ...row,
    isCompetitor: row.competeUnlockedAt !== null,
    // Derived, never stored. See lib/policy/minorPolicy.ts for why.
    isMinor: isMinor(row.dob),
  };
}

/* ---------------------------------------------------------------------------------
 * Onboarding
 *
 * Four steps, in order: date of birth, category, sub-style, handle and display name.
 * Each is its own function and each re-validates on the server. The client having
 * already checked is not evidence of anything — the age gate in particular is the one
 * check in this product that an attacker has an obvious motive to skip.
 * ------------------------------------------------------------------------------- */

/**
 * Step 1. Date of birth, and the age gate.
 *
 * This is where the profile row is created, and creating it is conditional on passing the
 * gate — so a blocked signup leaves no profile, no handle, and no stored date of birth for
 * someone we have just told we cannot serve. Storing "we rejected this twelve-year-old, and
 * here is their birthday" would be a strange thing to keep.
 *
 * The date of birth is written exactly once. Changing it later is a support action, not a
 * settings toggle, because it is the input to every Core rule 7 decision.
 */
export async function startOnboarding(
  actor: Actor,
  input: { userId: string; dob: string; displayName?: string },
): Promise<void> {
  requireSelfOrSystem(actor, input.userId, 'start onboarding for another user');

  const assessment = assessAge(input.dob);
  const refusal = signupRefusalMessage(assessment.band);
  if (refusal !== null) {
    // A ForbiddenError rather than a validation error: this is an authorization outcome,
    // and it must look like one to every caller.
    throw new ForbiddenError(refusal);
  }

  await db
    .insert(profiles)
    .values({
      userId: input.userId,
      dob: input.dob,
      // Both are placeholders the user replaces in the last step. The handle is derived
      // from the user id so it is unique without a round trip, and it is never shown:
      // onboarding is not finished until `completeOnboarding` overwrites it.
      displayName: input.displayName ?? 'New judge',
      handle: `judge_${input.userId.replaceAll('-', '').slice(0, 12)}`,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      // Resuming an abandoned onboarding must not wipe progress, and must not let a
      // second attempt overwrite a date of birth that already passed the gate.
      set: { dob: sql`COALESCE(${profiles.dob}, EXCLUDED.dob)`, updatedAt: new Date() },
    });
}

/** Step 2 and 3. The discipline, then the sub-style — both land here, most specific wins. */
export async function setPrimaryCategory(
  actor: Actor,
  input: { userId: string; categoryId: string },
): Promise<void> {
  requireSelfOrSystem(actor, input.userId, 'choose a category for another user');

  await db
    .update(profiles)
    .set({ primaryCategoryId: input.categoryId, updatedAt: new Date() })
    .where(eq(profiles.userId, input.userId));
}

/**
 * Step 4. Handle and display name, and the end of onboarding.
 *
 * Handle rules are re-applied here from `lib/domain/handle.ts` rather than trusted from
 * the form, and uniqueness is left to the database's unique index rather than checked
 * first — a check-then-insert has a race in it, and the race is two people getting the
 * same public identity.
 */
export async function completeOnboarding(
  actor: Actor,
  input: { userId: string; handle: string; displayName: string },
): Promise<void> {
  requireSelfOrSystem(actor, input.userId, 'complete onboarding for another user');

  const handle = normaliseHandle(input.handle);
  if (!isValidHandle(handle)) {
    throw new ForbiddenError(`"${input.handle}" is not a usable handle`);
  }

  const displayName = input.displayName.trim();
  if (displayName.length === 0) {
    throw new ForbiddenError('a display name is required');
  }

  await db
    .update(profiles)
    .set({
      handle,
      displayName,
      onboardingCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, input.userId));
}

/**
 * Is this handle free?
 *
 * For the live "that one is taken" hint in the form only. It is NOT the uniqueness
 * guarantee — that is the unique index, and `completeOnboarding` lets it do its job.
 */
export async function isHandleAvailable(actor: Actor, handle: string): Promise<boolean> {
  requireUser(actor, 'check handle availability');

  const normalised = normaliseHandle(handle);
  if (!isValidHandle(normalised)) return false;

  const rows = await db
    .select({ handle: profiles.handle })
    .from(profiles)
    .where(eq(profiles.handle, normalised))
    .limit(1);

  return rows.length === 0;
}

/** Where the user is in the sequence. Read on every protected request. */
export async function getOnboardingState(actor: Actor): Promise<OnboardingState> {
  const user = requireUser(actor, 'read your onboarding state');

  const rows = await db
    .select({
      dob: profiles.dob,
      primaryCategoryId: profiles.primaryCategoryId,
      onboardingCompletedAt: profiles.onboardingCompletedAt,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  const row = rows[0];
  if (row === undefined) {
    return {
      hasProfile: false,
      needsDateOfBirth: true,
      needsCategory: true,
      needsIdentity: true,
      isComplete: false,
    };
  }

  return {
    hasProfile: true,
    needsDateOfBirth: row.dob === null,
    needsCategory: row.primaryCategoryId === null,
    needsIdentity: row.onboardingCompletedAt === null,
    isComplete: row.onboardingCompletedAt !== null,
  };
}

/**
 * Mark a phone number verified.
 *
 * Deliberately takes no phone number. Arena has no reason to STORE one — the number is
 * used by the verification provider and then forgotten, and what we keep is the single
 * boolean that raises vote weight. A stored phone number for a fifteen-year-old is a
 * contact detail sitting in a database, and Core rule 7 is about not having those.
 */
export async function setPhoneVerified(actor: Actor, userId: string): Promise<void> {
  requireSelfOrSystem(actor, userId, 'mark another user’s phone as verified');

  await db
    .update(profiles)
    .set({ phoneVerified: true, updatedAt: new Date() })
    .where(eq(profiles.userId, userId));
}

/**
 * Record that the actor judged one comparison, and unlock competing at the threshold.
 *
 * Core rule 4: competing is EARNED. The unlock is a side effect of judging, set here in
 * the same statement that counts the judgement, so the count and the unlock cannot drift
 * apart. `UNLOCK_THRESHOLD` comes from the hypotheses file — never inline the number.
 */
export async function countComparisonAndMaybeUnlock(
  actor: Actor,
  userId: string,
): Promise<{ comparisonsCompleted: number; competeUnlockedAt: Date | null }> {
  requireSelfOrSystem(actor, userId, 'count a comparison for another user');

  const rows = await db
    .update(profiles)
    .set({
      comparisonsCompleted: sql`${profiles.comparisonsCompleted} + 1`,
      competeUnlockedAt: sql`
        CASE
          WHEN ${profiles.competeUnlockedAt} IS NOT NULL THEN ${profiles.competeUnlockedAt}
          WHEN ${profiles.comparisonsCompleted} + 1 >= ${UNLOCK_THRESHOLD} THEN now()
          ELSE NULL
        END`,
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, userId))
    .returning({
      comparisonsCompleted: profiles.comparisonsCompleted,
      competeUnlockedAt: profiles.competeUnlockedAt,
    });

  const row = rows[0];
  if (row === undefined) throw new Error(`No profile for user ${userId}`);
  return row;
}

/** Has this user earned the compete lane? Used as a gate before any entry is accepted. */
export async function hasCompeteUnlock(actor: Actor, userId: string): Promise<boolean> {
  requireSelfOrSystem(actor, userId, 'read another user’s unlock state');

  const rows = await db
    .select({ competeUnlockedAt: profiles.competeUnlockedAt })
    .from(profiles)
    .where(and(eq(profiles.userId, userId)))
    .limit(1);

  return rows[0]?.competeUnlockedAt != null;
}

/** The signed-in user's own profile, for the session-to-actor path. */
export async function getMyProfile(actor: Actor): Promise<OwnProfile | null> {
  const user = requireUser(actor, 'read your own profile');
  return getProfile(actor, user.id);
}
