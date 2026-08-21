/**
 * Ratings and leaderboards.
 *
 * Core rule 2: every number returned from this file traces back to comparisons in the set
 * piece lane. Nothing here reads `follows`, `signatureEntries`, or any count of views or
 * likes, and no function should ever be added that does.
 *
 * Core rule 5: `getDivisionStandings` is the board that matters. A category-wide board
 * exists (`getCategoryLeaderboard`) but is gated behind MIN_COMPETITORS_TO_SHOW_BOARD,
 * because a public ranking where almost everyone loses is the thing we are specifically
 * trying not to build.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { MIN_COMPETITORS_TO_SHOW_BOARD, PROVISIONAL_RD_THRESHOLD } from '@/lib/config/hypotheses';
import { type Actor, requireSelfOrSystem } from '../actor';
import { db } from '../client';
import { divisionMembers, divisions, profiles, ratings } from '../schema';

export type LeaderboardRow = {
  userId: string;
  displayName: string;
  handle: string;
  rating: number;
  /** Core rule 6: a provisional rating must be shown as a range, not a false precision. */
  isProvisional: boolean;
  position: number;
};

/**
 * A competitor's own rating, with the deviation. Personal because a rating deviation is
 * effectively a statement about how much we do not yet know about someone.
 */
export async function getMyRating(
  actor: Actor,
  input: { userId: string; categoryId: string },
): Promise<{
  rating: number;
  ratingDeviation: number;
  volatility: number;
  isProvisional: boolean;
  updatedAt: Date;
} | null> {
  requireSelfOrSystem(actor, input.userId, 'read another competitor’s rating detail');

  const rows = await db
    .select({
      rating: ratings.rating,
      ratingDeviation: ratings.ratingDeviation,
      volatility: ratings.volatility,
      updatedAt: ratings.updatedAt,
    })
    .from(ratings)
    .where(and(eq(ratings.userId, input.userId), eq(ratings.categoryId, input.categoryId)))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  return { ...row, isProvisional: row.ratingDeviation > PROVISIONAL_RD_THRESHOLD };
}

/**
 * The standings inside one division — the board a competitor actually lives on.
 *
 * Public: a division board is meant to be seen, and it carries no personal data beyond
 * the display name and handle that a profile page shows anyway.
 */
export async function getDivisionStandings(
  _actor: Actor,
  divisionId: string,
): Promise<Array<{ userId: string; displayName: string; handle: string; points: number }>> {
  return db
    .select({
      userId: divisionMembers.userId,
      displayName: profiles.displayName,
      handle: profiles.handle,
      points: divisionMembers.points,
    })
    .from(divisionMembers)
    .innerJoin(profiles, eq(profiles.userId, divisionMembers.userId))
    .where(eq(divisionMembers.divisionId, divisionId))
    .orderBy(desc(divisionMembers.points));
}

/** Public: the divisions running in a season. */
export async function listSeasonDivisions(
  _actor: Actor,
  seasonId: string,
): Promise<Array<{ id: string; tier: string; name: string }>> {
  return db
    .select({ id: divisions.id, tier: divisions.tier, name: divisions.name })
    .from(divisions)
    .where(eq(divisions.seasonId, seasonId));
}

/**
 * The category-wide board.
 *
 * Returns null — not an empty list — when there are fewer than
 * MIN_COMPETITORS_TO_SHOW_BOARD rated competitors. Null means "there is no board yet, go
 * show progress instead"; an empty array would mean "the board is empty", which is a
 * different and much more discouraging thing to render.
 */
export async function getCategoryLeaderboard(
  _actor: Actor,
  categoryId: string,
  limit = 50,
): Promise<LeaderboardRow[] | null> {
  const counted = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ratings)
    .where(eq(ratings.categoryId, categoryId));

  if ((counted[0]?.count ?? 0) < MIN_COMPETITORS_TO_SHOW_BOARD) return null;

  const rows = await db
    .select({
      userId: ratings.userId,
      displayName: profiles.displayName,
      handle: profiles.handle,
      rating: ratings.rating,
      ratingDeviation: ratings.ratingDeviation,
    })
    .from(ratings)
    .innerJoin(profiles, eq(profiles.userId, ratings.userId))
    .where(eq(ratings.categoryId, categoryId))
    .orderBy(desc(ratings.rating))
    .limit(limit);

  return rows.map((row, index) => ({
    userId: row.userId,
    displayName: row.displayName,
    handle: row.handle,
    rating: row.rating,
    isProvisional: row.ratingDeviation > PROVISIONAL_RD_THRESHOLD,
    position: index + 1,
  }));
}
