/**
 * Comparisons — blind pairwise voting. The most consequential file in the data layer.
 *
 * Core rule 3 says: blind before, revealed after, and the reveal is a state change rather
 * than a rendering decision. That is implemented here as three separate steps that cannot
 * be short-circuited:
 *
 *   1. `nextBlindPair`   — reads the identity-free view and records that a pair was SHOWN.
 *   2. `recordVote`      — writes the decision. This is the state change.
 *   3. `revealComparison` — refuses to return a name until step 2 has happened.
 *
 * There is no function here that returns an entry and its owner in one call before a
 * vote. That is not an oversight to be helpfully corrected later.
 */

import { and, eq, isNull, notInArray, or, sql } from 'drizzle-orm';
import { type Actor, ForbiddenError, requireUser } from '../actor';
import { db } from '../client';
import { comparisons, profiles, setPieceEntries, setPieceEntryBlind } from '../schema';
import type { BlindEntry, BlindPair, RevealedCompetitor } from '../types';
import { countComparisonAndMaybeUnlock } from './profiles';

/**
 * Draw the next pair for this voter and record that it was shown.
 *
 * Reads `setPieceEntryBlind`, which has no `user_id` column at all — so this function
 * could not return a competitor's identity even if the select list were wrong. The
 * voter's own entries are excluded via a subquery that filters on `user_id` without ever
 * returning it.
 *
 * Pairing here is uniform-random among eligible entries. That is deliberately naive:
 * rating-aware pairing (which pairs close ratings to extract more information per vote)
 * is Prompt 10's job, and doing it early would mean tuning it against seed data.
 */
export async function nextBlindPair(actor: Actor, setPieceId: string): Promise<BlindPair | null> {
  const voter = requireUser(actor, 'judge a pair');

  const ownEntries = db
    .select({ id: setPieceEntries.id })
    .from(setPieceEntries)
    .where(and(eq(setPieceEntries.setPieceId, setPieceId), eq(setPieceEntries.userId, voter.id)));

  const candidates = await db
    .select({
      id: setPieceEntryBlind.id,
      setPieceId: setPieceEntryBlind.setPieceId,
      videoSource: setPieceEntryBlind.videoSource,
      muxPlaybackId: setPieceEntryBlind.muxPlaybackId,
      fixturePath: setPieceEntryBlind.fixturePath,
      durationMs: setPieceEntryBlind.durationMs,
    })
    .from(setPieceEntryBlind)
    .where(
      and(
        eq(setPieceEntryBlind.setPieceId, setPieceId),
        // Core rule 3 has a sibling rule: you never judge yourself.
        notInArray(setPieceEntryBlind.id, ownEntries),
      ),
    )
    .orderBy(sql`random()`)
    .limit(2);

  const [a, b] = candidates;
  if (a === undefined || b === undefined) return null;

  const inserted = await db
    .insert(comparisons)
    .values({ setPieceId, voterId: voter.id, entryA: a.id, entryB: b.id })
    .returning({ id: comparisons.id });

  const row = inserted[0];
  if (row === undefined) throw new Error('Failed to record that a pair was shown');

  return {
    comparisonId: row.id,
    setPieceId,
    a: a satisfies BlindEntry,
    b: b satisfies BlindEntry,
  };
}

/**
 * Record a vote. This is the state change that unlocks the reveal.
 *
 * The WHERE clause is the authorization: it matches only a comparison that belongs to
 * this voter and has not already been decided, so replaying a vote or voting on someone
 * else's pair updates nothing and is reported as forbidden rather than silently ignored.
 * The winner being one of the two entries is enforced by a CHECK constraint, not here.
 *
 * Caveat, stated rather than hidden: the vote and the judged-count increment are two
 * statements, and Neon's HTTP driver has no interactive transactions (ADR 0002). A crash
 * between them under-counts a judged comparison. Acceptable now — it costs a user one
 * comparison of unlock progress. Prompt 14 moves vote integrity onto the pooled WebSocket
 * driver, and this becomes one transaction there.
 */
export async function recordVote(
  actor: Actor,
  input: { comparisonId: string; winnerEntryId: string },
): Promise<{ comparisonsCompleted: number; competeUnlockedAt: Date | null }> {
  const voter = requireUser(actor, 'record a vote');

  const updated = await db
    .update(comparisons)
    .set({ winnerEntryId: input.winnerEntryId, decidedAt: new Date() })
    .where(
      and(
        eq(comparisons.id, input.comparisonId),
        eq(comparisons.voterId, voter.id),
        isNull(comparisons.decidedAt),
      ),
    )
    .returning({ id: comparisons.id });

  if (updated[0] === undefined) {
    throw new ForbiddenError('vote on a comparison that is not yours, or is already decided');
  }

  return countComparisonAndMaybeUnlock(actor, voter.id);
}

/**
 * The reveal — the reward for voting, and the ONLY path from an entry to a name.
 *
 * Refuses on two grounds: the comparison must belong to this voter, and it must have been
 * decided. An undecided comparison throws rather than returning an empty list, because a
 * caller that gets `[]` back tends to render nothing and move on, while a caller that
 * gets an exception has to decide what the rule means.
 */
export async function revealComparison(
  actor: Actor,
  comparisonId: string,
): Promise<RevealedCompetitor[]> {
  const voter = requireUser(actor, 'reveal a comparison');

  const found = await db
    .select({
      entryA: comparisons.entryA,
      entryB: comparisons.entryB,
      winnerEntryId: comparisons.winnerEntryId,
      decidedAt: comparisons.decidedAt,
    })
    .from(comparisons)
    .where(and(eq(comparisons.id, comparisonId), eq(comparisons.voterId, voter.id)))
    .limit(1);

  const comparison = found[0];
  if (comparison === undefined) {
    throw new ForbiddenError('reveal a comparison that is not yours');
  }
  if (comparison.decidedAt === null) {
    throw new ForbiddenError('reveal a comparison before voting on it');
  }

  const rows = await db
    .select({
      entryId: setPieceEntries.id,
      userId: profiles.userId,
      displayName: profiles.displayName,
      handle: profiles.handle,
    })
    .from(setPieceEntries)
    .innerJoin(profiles, eq(profiles.userId, setPieceEntries.userId))
    .where(
      or(eq(setPieceEntries.id, comparison.entryA), eq(setPieceEntries.id, comparison.entryB)),
    );

  return rows.map((row) => ({
    ...row,
    won: row.entryId === comparison.winnerEntryId,
  }));
}

/** How many comparisons this voter has decided. Their own number only. */
export async function countMyDecidedComparisons(actor: Actor): Promise<number> {
  const voter = requireUser(actor, 'count your comparisons');

  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(comparisons)
    .where(and(eq(comparisons.voterId, voter.id), sql`${comparisons.decidedAt} IS NOT NULL`));

  return rows[0]?.count ?? 0;
}
