/**
 * Which two entries to put in front of a judge.
 *
 * This is the quietest high-stakes function in the product. Nobody sees it, and it decides
 * whether the ratings mean anything: a pairing that always compares the strongest against
 * the weakest learns nothing per vote, and one that serves the same three entries all week
 * breaks the promise that every competitor gets seen.
 *
 * Four pressures, deliberately weighted rather than ranked:
 *
 *   1. **Information gain.** A comparison between two entries we already believe are far
 *      apart tells us almost nothing — we knew who would win. Close ratings and high
 *      uncertainty are where a vote actually moves the estimate.
 *   2. **Guaranteed attention.** Core promise, not a nice-to-have. Entries with fewer
 *      views are pushed up, hard enough to beat a marginally better information score.
 *   3. **Fairness.** A voter never judges their own entry, their division-mates, or a pair
 *      they have already seen. The first is a database trigger; the other two are here.
 *   4. **Freshness.** An entry at the view cap stops being served at all, so late entries
 *      are not permanently starved by whatever arrived first.
 *
 * Framework-free and pure: the caller loads candidates, this picks. That split is what
 * makes the interesting half testable without a database, and it is also what keeps Core
 * rule 3 intact — nothing here knows who owns an entry, because it is never told.
 */

import { MAX_VIEWS_PER_ENTRY } from '@/lib/config/hypotheses';

/**
 * One entry, as the pairing sees it.
 *
 * Note what is absent: no `userId`, no handle, no division. The caller filters on those
 * before it gets here, so this module could not leak an identity if it tried.
 */
export type PairCandidate = {
  entryId: string;
  /** The owner's current Glicko-2 rating in this category. */
  rating: number;
  /** Their rating deviation — how unsure we are. High means a vote here is worth more. */
  ratingDeviation: number;
  /** How many times this entry has already been served to anybody. */
  views: number;
};

export type ScoredPair = { a: PairCandidate; b: PairCandidate; score: number };

/** Rating points apart at which two entries stop being informative to compare. */
const RATING_SPREAD_SCALE = 200;

/**
 * How strongly view-levelling pulls against information gain.
 *
 * At 1.0 the two are equal partners. Below that, a well-understood entry with few views
 * still gets served — which is what "guaranteed attention" has to mean if it means
 * anything.
 */
const VIEW_LEVELLING_WEIGHT = 1.4;

/** Ignore an entry once it has had its share. `MAX_VIEWS_PER_ENTRY` is a hypothesis. */
export const viewCap = (): number => MAX_VIEWS_PER_ENTRY;

/**
 * Information gain, 0 to 1.
 *
 * Two components. Closeness: entries within a few rating points are a genuine question,
 * entries 400 apart are not. Uncertainty: a pair where both ratings are provisional moves
 * the estimate far more than one where both are settled.
 */
export function informationGain(a: PairCandidate, b: PairCandidate): number {
  const gap = Math.abs(a.rating - b.rating);
  const closeness = 1 / (1 + gap / RATING_SPREAD_SCALE);

  // Normalised against the Glicko-2 starting deviation of 350.
  const uncertainty = Math.min(1, (a.ratingDeviation + b.ratingDeviation) / (2 * 350));

  // Closeness matters more: an uncertain but hopelessly lopsided pair is still a wasted
  // vote, whereas a close pair between two settled ratings is a genuine tie-break.
  return closeness * 0.65 + uncertainty * 0.35;
}

/**
 * How badly this pair needs views, 0 to 1.
 *
 * Driven by the LESS-seen of the two, so pairing a starved entry with a popular one still
 * scores well — that is how a new entry gets its first views at all.
 */
export function viewDeficit(a: PairCandidate, b: PairCandidate, cap: number): number {
  const leastSeen = Math.min(a.views, b.views);
  if (cap <= 0) return 0;
  return Math.max(0, 1 - leastSeen / cap);
}

export function scorePair(a: PairCandidate, b: PairCandidate, cap: number = viewCap()): number {
  return informationGain(a, b) + VIEW_LEVELLING_WEIGHT * viewDeficit(a, b, cap);
}

/** Order-independent key for "this voter has already seen these two". */
export function pairKey(entryA: string, entryB: string): string {
  return entryA < entryB ? `${entryA}:${entryB}` : `${entryB}:${entryA}`;
}

export type SelectPairInput = {
  candidates: PairCandidate[];
  /** Pairs this voter has already been shown, as `pairKey` strings. */
  seenPairs: ReadonlySet<string>;
  cap?: number;
};

/**
 * Choose the next pair, or null when there is nothing left to ask.
 *
 * Returning null is a real answer and not an error: "you have judged everything on this
 * brief" is a finished session, which Core rule 8 treats as the design working rather than
 * as a problem to solve with more content.
 *
 * O(n²) over candidates. With a brief's worth of entries that is a few hundred pairs and
 * costs nothing; if a single brief ever carries thousands of entries this wants a
 * rating-bucketed shortlist instead of an exhaustive scan.
 */
export function selectPair(input: SelectPairInput): ScoredPair | null {
  const cap = input.cap ?? viewCap();
  const available = input.candidates.filter((candidate) => candidate.views < cap);

  if (available.length < 2) {
    /*
     * Everything is at the view cap. Rather than showing nothing, fall back to the full
     * set — a judge who wants to keep going is more valuable than a levelling rule that
     * is, after all, a hypothesis. The cap is about spreading attention, not rationing it.
     */
    return selectFrom(input.candidates, input.seenPairs, cap);
  }

  return (
    selectFrom(available, input.seenPairs, cap) ??
    selectFrom(input.candidates, input.seenPairs, cap)
  );
}

function selectFrom(
  candidates: PairCandidate[],
  seenPairs: ReadonlySet<string>,
  cap: number,
): ScoredPair | null {
  let best: ScoredPair | null = null;

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      if (a === undefined || b === undefined) continue;
      if (seenPairs.has(pairKey(a.entryId, b.entryId))) continue;

      const score = scorePair(a, b, cap);
      if (best === null || score > best.score) best = { a, b, score };
    }
  }

  return best;
}

/**
 * Present the pair in a random order.
 *
 * The selection above is deterministic, which is right for choosing but wrong for
 * showing: if the higher-rated entry were always on the left, a judge would learn the
 * tell within a session and the vote would stop being blind. Position must carry no
 * information.
 */
export function presentInRandomOrder<T>(a: T, b: T, random: () => number = Math.random): [T, T] {
  return random() < 0.5 ? [a, b] : [b, a];
}
