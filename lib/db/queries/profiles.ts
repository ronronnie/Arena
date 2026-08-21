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
import { isMinor } from '@/lib/domain/age';
import { type Actor, requireSelfOrSystem, requireUser } from '../actor';
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
  comparisonsCompleted: number;
  competeUnlockedAt: Date | null;
  createdAt: Date;
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
    // Derived, never stored. See lib/domain/age.ts for why.
    isMinor: isMinor(row.dob),
  };
}

/** Create the Arena profile for an already-authenticated identity. */
export async function createProfile(
  actor: Actor,
  input: { userId: string; displayName: string; handle: string; dob?: string | null },
): Promise<void> {
  requireSelfOrSystem(actor, input.userId, 'create a profile for another user');

  await db.insert(profiles).values({
    userId: input.userId,
    displayName: input.displayName,
    handle: input.handle,
    dob: input.dob ?? null,
  });
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
