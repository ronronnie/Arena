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
 *
 * **On reading `user_id` in the pairing query.** The exclusions below join
 * `set_piece_entries` and filter on its `user_id` — you cannot leave out a voter's own
 * entry without knowing who owns what. The rule is about what is RETURNED, and `user_id`
 * is never in a select list on this path. The blind view exists so that the columns handed
 * back cannot include one by accident.
 */

import { and, eq, isNull, ne, notInArray, or, sql } from 'drizzle-orm';
import {
  pairKey,
  presentInRandomOrder,
  selectPair,
  type PairCandidate,
} from '@/lib/domain/pairing';
import { voteWeight } from '@/lib/domain/voteWeight';
import { type Actor, ForbiddenError, requireUser } from '../actor';
import { db } from '../client';
import {
  comparisons,
  divisionMembers,
  profiles,
  ratings,
  setPieceEntries,
  setPieceEntryBlind,
} from '../schema';
import type { BlindEntry, BlindPair, RevealedCompetitor } from '../types';
import { countComparisonAndMaybeUnlock } from './profiles';

/** Glicko-2 defaults, for an entry whose owner has no rating row yet. */
const DEFAULT_RATING = 1500;
const DEFAULT_RATING_DEVIATION = 350;

/**
 * The longest a "decision" can meaningfully take: ten minutes.
 *
 * Anything beyond that is an abandoned tab, not deliberation, and recording it would
 * poison the vote-quality signal Prompt 14 reads. Clamping also stops the column
 * overflowing — `decision_ms` is a Postgres `integer`, and an unclamped elapsed time from
 * a mis-initialised clock is around 1.7e12, which is not a validation error but a 500.
 * That is exactly how this was found.
 */
const MAX_DECISION_MS = 10 * 60_000;

/**
 * Draw the next pair for this voter and record that it was shown.
 *
 * The exclusions, in the order the prompt pack states them:
 *
 *   - **Never the voter's own entry.** Belt and braces: filtered here, and refused by the
 *     `comparisons_no_self_vote` trigger if this filter were ever wrong.
 *   - **Never a division-mate.** If the voter competes in this brief, everyone sharing
 *     their division is excluded — those are the people they are directly placed against,
 *     and asking someone to rank their own competition is asking for trouble that no
 *     amount of good faith fixes.
 *   - **Never a pair they have already seen**, in either orientation.
 *   - **Nothing past the view cap**, so attention spreads.
 *
 * On "direct rivals": the pack lists this separately from division-mates. In this schema
 * a division IS the rivalry unit — it is the set of people you are ranked against — so the
 * division exclusion covers it. If rivalries become a first-class concept (Prompt 17), this
 * needs revisiting rather than assuming it is still covered.
 */
export async function nextBlindPair(actor: Actor, setPieceId: string): Promise<BlindPair | null> {
  const voter = requireUser(actor, 'judge a pair');

  /* Everyone in a division the voter belongs to — themselves included. */
  const divisionMates = db
    .select({ userId: divisionMembers.userId })
    .from(divisionMembers)
    .where(
      sql`${divisionMembers.divisionId} IN (
        SELECT dm.division_id FROM division_members dm WHERE dm.user_id = ${voter.id}
      )`,
    );

  const rows = await db
    .select({
      entryId: setPieceEntryBlind.id,
      setPieceId: setPieceEntryBlind.setPieceId,
      videoSource: setPieceEntryBlind.videoSource,
      muxPlaybackId: setPieceEntryBlind.muxPlaybackId,
      fixturePath: setPieceEntryBlind.fixturePath,
      durationMs: setPieceEntryBlind.durationMs,
      rating: sql<number>`COALESCE(${ratings.rating}, ${DEFAULT_RATING})`,
      ratingDeviation: sql<number>`COALESCE(${ratings.ratingDeviation}, ${DEFAULT_RATING_DEVIATION})`,
    })
    .from(setPieceEntryBlind)
    // Joined to apply the ownership exclusions. `user_id` is filtered on, never selected.
    .innerJoin(setPieceEntries, eq(setPieceEntries.id, setPieceEntryBlind.id))
    // The owner's rating drives information gain. Joined through the entry, so the rating
    // is read without the owner ever reaching a select list.
    .leftJoin(
      ratings,
      and(
        eq(ratings.userId, setPieceEntries.userId),
        eq(ratings.categoryId, setPieceEntries.categoryId),
      ),
    )
    .where(
      and(
        eq(setPieceEntryBlind.setPieceId, setPieceId),
        ne(setPieceEntries.userId, voter.id),
        notInArray(setPieceEntries.userId, divisionMates),
      ),
    );

  if (rows.length < 2) return null;

  /*
   * Every comparison on this brief, once. It answers both questions the pairing needs —
   * how often each entry has been served, and which pairs THIS voter has already seen —
   * and it is one indexed read of a few hundred rows.
   *
   * The first version asked for the view count as a correlated subquery per candidate,
   * which scanned the comparisons table once for every entry on the brief. It was correct
   * and slow enough that a vote queued behind the prefetch and the screen appeared to
   * hang. Tallying in TypeScript is both faster and easier to read.
   */
  const allOnBrief = await db
    .select({
      entryA: comparisons.entryA,
      entryB: comparisons.entryB,
      voterId: comparisons.voterId,
    })
    .from(comparisons)
    .where(eq(comparisons.setPieceId, setPieceId));

  const views = new Map<string, number>();
  const seenPairs = new Set<string>();

  for (const row of allOnBrief) {
    views.set(row.entryA, (views.get(row.entryA) ?? 0) + 1);
    views.set(row.entryB, (views.get(row.entryB) ?? 0) + 1);
    if (row.voterId === voter.id) seenPairs.add(pairKey(row.entryA, row.entryB));
  }

  const chosen = selectPair({
    candidates: rows.map((row): PairCandidate => ({
      entryId: row.entryId,
      rating: Number(row.rating),
      ratingDeviation: Number(row.ratingDeviation),
      views: views.get(row.entryId) ?? 0,
    })),
    seenPairs,
  });

  if (chosen === null) return null;

  const byId = new Map(rows.map((row) => [row.entryId, row]));
  const left = byId.get(chosen.a.entryId);
  const right = byId.get(chosen.b.entryId);
  if (left === undefined || right === undefined) return null;

  const toBlind = (row: NonNullable<typeof left>): BlindEntry => ({
    id: row.entryId,
    setPieceId: row.setPieceId,
    videoSource: row.videoSource,
    muxPlaybackId: row.muxPlaybackId,
    fixturePath: row.fixturePath,
    durationMs: row.durationMs,
  });

  /*
   * Randomise which side each entry appears on. Selection is deterministic — right for
   * choosing, wrong for showing: if the higher-rated entry were always on the left, a
   * judge would learn the tell within a session and the vote would stop being blind.
   */
  const [first, second] = presentInRandomOrder(toBlind(left), toBlind(right));

  const inserted = await db
    .insert(comparisons)
    .values({ setPieceId, voterId: voter.id, entryA: first.id, entryB: second.id })
    .returning({ id: comparisons.id });

  const row = inserted[0];
  if (row === undefined) throw new Error('Failed to record that a pair was shown');

  return { comparisonId: row.id, setPieceId, a: first, b: second };
}

/** What the voting screen sends back when a judge decides. */
export type VoteInput = {
  comparisonId: string;
  /** Null when the judge skipped. */
  winnerEntryId: string | null;
  /** Milliseconds from the pair appearing to the tap. */
  decisionMs: number;
  /** Did they watch enough of both clips to be comparing them? */
  bothWatched: boolean;
};

/**
 * Record a vote, or a skip.
 *
 * The WHERE clause is the authorization: it matches only a comparison that belongs to this
 * voter and has not already been decided, so replaying a vote or voting on someone else's
 * pair updates nothing and is reported as forbidden rather than silently ignored.
 *
 * A skip is stored, not discarded. "I cannot tell these apart" is information about the
 * pairing, and throwing it away would make the algorithm look better than it is. It never
 * reaches a rating: `isCounted` goes false with a stated reason, which is the same
 * mechanism vote integrity uses in Prompt 14.
 *
 * Caveat, stated rather than hidden: the vote and the judged-count increment are two
 * statements, and Neon's HTTP driver has no interactive transactions (ADR 0002). A crash
 * between them under-counts one comparison of unlock progress. Prompt 14 moves this onto
 * the pooled WebSocket driver.
 */
export async function recordVote(
  actor: Actor,
  input: VoteInput,
): Promise<{ comparisonsCompleted: number; competeUnlockedAt: Date | null }> {
  const voter = requireUser(actor, 'record a vote');
  const skipped = input.winnerEntryId === null;

  /*
   * Weight is stamped at decision time, from what is true about this judge NOW. Somebody
   * who verifies their phone next week should not retroactively change the weight of votes
   * they cast today — `voter_weight` is a fact about the vote, not about the judge.
   */
  const weight = skipped ? 0 : await currentVoteWeight(voter.id);

  const updated = await db
    .update(comparisons)
    .set({
      winnerEntryId: input.winnerEntryId,
      decidedAt: new Date(),
      decisionMs: clampDecisionMs(input.decisionMs),
      bothWatched: input.bothWatched,
      skipped,
      voterWeight: weight,
      isCounted: !skipped,
      discountReason: skipped ? 'skipped by the judge' : null,
    })
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

  /*
   * A skip is not a judged comparison, so it does not count toward the compete-unlock.
   * Otherwise the fastest route to entering would be tapping "skip" twenty-five times,
   * which would make Core rule 4's gate meaningless.
   */
  if (skipped) {
    const rows = await db
      .select({
        comparisonsCompleted: profiles.comparisonsCompleted,
        competeUnlockedAt: profiles.competeUnlockedAt,
      })
      .from(profiles)
      .where(eq(profiles.userId, voter.id))
      .limit(1);

    const row = rows[0];
    return row ?? { comparisonsCompleted: 0, competeUnlockedAt: null };
  }

  return countComparisonAndMaybeUnlock(actor, voter.id);
}

/** Never negative, never absurd, never bigger than the column. */
export function clampDecisionMs(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.min(MAX_DECISION_MS, Math.max(0, Math.round(ms)));
}

/** Phone verification raises weight; calibration will scale it from Prompt 13. */
async function currentVoteWeight(userId: string): Promise<number> {
  const rows = await db
    .select({ phoneVerified: profiles.phoneVerified })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  return voteWeight({ phoneVerified: rows[0]?.phoneVerified ?? false });
}

/**
 * The reveal — the reward for voting, and the ONLY path from an entry to a name.
 *
 * Refuses on two grounds: the comparison must belong to this voter, and it must have been
 * decided. An undecided comparison throws rather than returning an empty list, because a
 * caller that gets `[]` back tends to render nothing and move on, while a caller that gets
 * an exception has to decide what the rule means.
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
    .where(
      and(
        eq(comparisons.voterId, voter.id),
        sql`${comparisons.decidedAt} IS NOT NULL`,
        eq(comparisons.skipped, false),
      ),
    );

  return rows[0]?.count ?? 0;
}
