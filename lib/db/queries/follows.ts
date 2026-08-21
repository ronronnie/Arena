/**
 * Following — the unranked social graph.
 *
 * Core rules 1 and 2 in one sentence: nothing in this file may ever be imported by
 * anything that computes a rating. Follows affect the signature lane and a follower
 * count, full stop. If a future prompt asks for "trending" or "popular" to influence
 * standing, that is a change to Core rule 2 and needs an ADR before it needs code.
 *
 * Core rule 7 also lands here. Following is the closest thing Arena has to a social
 * connection, so the follower LIST is never exposed — only counts. A judge cannot
 * enumerate who follows a young competitor, which is the first step of the contact
 * surface we have promised not to build.
 */

import { and, eq, sql } from 'drizzle-orm';
import { type Actor, requireUser } from '../actor';
import { db } from '../client';
import { follows, profiles } from '../schema';

/** Follow someone. The self-follow case is refused by a CHECK constraint. */
export async function follow(actor: Actor, followeeId: string): Promise<void> {
  const user = requireUser(actor, 'follow someone');

  await db.insert(follows).values({ followerId: user.id, followeeId }).onConflictDoNothing();
}

export async function unfollow(actor: Actor, followeeId: string): Promise<void> {
  const user = requireUser(actor, 'unfollow someone');

  await db
    .delete(follows)
    .where(and(eq(follows.followerId, user.id), eq(follows.followeeId, followeeId)));
}

/**
 * Counts only. Deliberately not "who".
 *
 * Note also that this number must never reach a rating calculation — it is a vanity
 * number for the signature lane, and Core rule 2 says ranking comes from comparisons.
 */
export async function getFollowerCount(_actor: Actor, userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.followeeId, userId));

  return rows[0]?.count ?? 0;
}

/** Does the signed-in user follow this person? Their own relationship only. */
export async function isFollowing(actor: Actor, followeeId: string): Promise<boolean> {
  const user = requireUser(actor, 'check who you follow');

  const rows = await db
    .select({ followeeId: follows.followeeId })
    .from(follows)
    .where(and(eq(follows.followerId, user.id), eq(follows.followeeId, followeeId)))
    .limit(1);

  return rows.length > 0;
}

/**
 * Who the signed-in user follows — their own list, never anybody else's.
 *
 * This is the one direction that is safe to enumerate: you already know who you followed.
 * There is no mirror function for followers, and that asymmetry is the point.
 */
export async function listMyFollowing(
  actor: Actor,
): Promise<Array<{ userId: string; displayName: string; handle: string }>> {
  const user = requireUser(actor, 'list who you follow');

  return db
    .select({
      userId: profiles.userId,
      displayName: profiles.displayName,
      handle: profiles.handle,
    })
    .from(follows)
    .innerJoin(profiles, eq(profiles.userId, follows.followeeId))
    .where(eq(follows.followerId, user.id));
}
