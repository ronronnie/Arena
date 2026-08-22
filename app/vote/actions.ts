'use server';

import { getActor } from '@/lib/auth/session';
import {
  ForbiddenError,
  nextBlindPair,
  recordVote,
  revealComparison,
  type BlindPair,
  type RevealedCompetitor,
} from '@/lib/db';

/**
 * The three steps of a vote, as server actions.
 *
 * They are separate on purpose, and the separation is Core rule 3 rather than tidiness:
 * `drawPair` cannot return an identity because it reads the blind view, and `reveal`
 * refuses until a decision exists. A single "vote and get everything" action would put the
 * two on the same wire and the rule would depend on the client asking nicely.
 */

export type DrawResult = { pair: BlindPair | null };

/** Step 1 — the next pair. Also used to prefetch, so the next one is ready before the tap. */
export async function drawPair(setPieceId: string): Promise<DrawResult> {
  const actor = await getActor();
  return { pair: await nextBlindPair(actor, setPieceId) };
}

export type VoteResult =
  | {
      ok: true;
      revealed: RevealedCompetitor[];
      comparisonsCompleted: number;
      justUnlocked: boolean;
      /** The pair to show next, drawn in the same round trip. */
      nextPair: BlindPair | null;
    }
  | { ok: false; problem: string };

/**
 * Steps 2 and 3 — record the decision, reveal, and draw the next pair.
 *
 * All in one round trip, and the third part is the interesting one. The obvious design
 * prefetches the next pair separately while the judge is still watching — but **Next
 * serialises server actions from a client**, so a prefetch in flight delays the vote
 * behind it. That is not a hypothetical: it made the screen appear to hang for ten
 * seconds at a time, and it got worse the faster somebody voted, which is precisely
 * backwards for a surface built around a decision every ten seconds.
 *
 * Returning the next pair from the vote removes the contention entirely — one request
 * per decision, and the next pair is ready exactly when the reveal is dismissed. The
 * three data-layer functions stay separate, and the reveal still refuses without a
 * recorded decision; this is a change to how many times the network is crossed, not to
 * the rule.
 */
export async function submitVote(input: {
  setPieceId: string;
  comparisonId: string;
  winnerEntryId: string | null;
  decisionMs: number;
  bothWatched: boolean;
  /** What their unlock counter read before this vote, to spot the moment it crosses. */
  previousCompleted: number;
}): Promise<VoteResult> {
  const actor = await getActor();

  try {
    const progress = await recordVote(actor, {
      comparisonId: input.comparisonId,
      winnerEntryId: input.winnerEntryId,
      decisionMs: input.decisionMs,
      bothWatched: input.bothWatched,
    });

    /*
     * The reveal and the next pair are independent once the vote is written, so they go
     * in parallel. Every one of these is a round trip to Neon on the HTTP driver, and the
     * whole point of this screen is a decision every ten seconds — sequential awaits here
     * were costing most of a second for no reason.
     *
     * A skip has nothing to reveal: nobody was chosen, so there is no reward to give.
     */
    const [revealed, nextPair] = await Promise.all([
      input.winnerEntryId === null
        ? Promise.resolve<RevealedCompetitor[]>([])
        : revealComparison(actor, input.comparisonId),
      // Drawn AFTER the vote is recorded, so the pair just judged is already excluded.
      nextBlindPair(actor, input.setPieceId),
    ]);

    return {
      ok: true,
      revealed,
      comparisonsCompleted: progress.comparisonsCompleted,
      justUnlocked:
        progress.competeUnlockedAt !== null &&
        progress.comparisonsCompleted > input.previousCompleted,
      nextPair,
    };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, problem: error.message };
    throw error;
  }
}
