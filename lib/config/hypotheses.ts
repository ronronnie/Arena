/**
 * HYPOTHESES — tunable guesses, not findings.
 *
 * Every number in this file is a bet we have not yet won. They live here, together,
 * because the day a real user contradicts one of them we want to change a single line
 * rather than hunt through the codebase for a magic number.
 *
 * Rules for this file:
 *   1. Nothing outside this file may hardcode any of these values. Import them.
 *   2. Every constant carries: what it is based on, and what evidence would change it.
 *   3. When evidence arrives, change the value AND write an ADR in /docs/decisions/
 *      recording what we learned. The comment is the audit trail.
 *
 * This file is framework-free and must stay that way.
 */

/**
 * Comparisons a user must judge before the compete lane unlocks (Core rule 4).
 *
 * Based on: nothing. A round number that felt like "enough to understand the standard
 * you're about to be held to" — roughly 3-4 minutes of judging.
 * Would change if: unlock-completion rate is low (too high a wall) or newly unlocked
 * competitors show poor judging calibration (too low a wall). Watch the funnel from
 * signup -> first comparison -> 25th comparison -> first entry.
 */
export const UNLOCK_THRESHOLD = 25;

/**
 * Competitors per division (Core rule 5 — most users should be able to win somewhere).
 *
 * Based on: Duolingo Leagues, which uses 30. Borrowed from their users, not ours.
 * Would change if: divisions feel empty at the tail (too large), or promotion feels
 * unearned and the ladder churns people upward too fast (too small). Watch the
 * distribution of entries-per-division, not the headcount.
 */
export const DIVISION_SIZE = 30;

/**
 * How many competitors move up a division at the end of a season.
 *
 * Based on: ~23% of DIVISION_SIZE, matching the Duolingo shape.
 * Would change if: season-over-season return rate for promoted users is no better than
 * for those who stayed put — that would mean promotion isn't the motivator we think.
 */
export const PROMOTE_COUNT = 7;

/**
 * How many competitors move down a division at the end of a season.
 *
 * Based on: deliberately fewer than PROMOTE_COUNT. Losing should sting less than
 * winning rewards; that asymmetry is the whole retention thesis.
 * Would change if: the kill criterion trips — under ~40% of entrants returning across
 * three seasons means divisions do not solve the losing problem.
 */
export const RELEGATE_COUNT = 5;

/**
 * Target ratio of entries to fans — 1 entry per 5 fans.
 *
 * Based on: arithmetic on an assumption. If each entry needs enough pairwise votes for
 * a stable rating, the audience has to outnumber the competitors by roughly this much.
 * Would change if: entries routinely finish a drop under-voted (need more audience per
 * entry) or votes pile up far beyond what rating convergence requires (can afford more
 * competitors). This is the number that tells us whether to recruit judges or performers.
 */
export const TARGET_ENTRY_TO_FAN_RATIO = 0.2;

/**
 * Views after which an entry is considered stale for the audience and stops being
 * served in fresh pairs.
 *
 * Based on: a guess at the point where additional votes stop moving the rating enough
 * to be worth an audience member's attention.
 * Would change if: rating deviation is still high at 200 views (serve more) or has long
 * since converged well before it (serve fewer, and give the slot to a newer entry).
 */
export const MAX_VIEWS_PER_ENTRY = 200;

/**
 * Glicko-2 rating deviation at or below which a rating stops being "provisional" and is
 * shown as a real number rather than a range.
 *
 * Based on: common Glicko practice (RD <= ~80 on the 350-scale is treated as settled).
 * Not validated against our own convergence data, because we have none yet.
 * Would change if: ratings shown as settled still swing hard in the next season, or
 * users stay stuck behind a provisional label long enough to disengage.
 */
export const PROVISIONAL_RD_THRESHOLD = 80;

/**
 * Minimum rated competitors in a category before a leaderboard is shown at all.
 *
 * Based on: a guess at the point where a public ranking stops being embarrassing and
 * starts being credible. Under this, we show progress instead of a board.
 * Would change if: small boards drive sign-ups anyway (lower it) or early boards get
 * screenshotted and mocked (raise it). Rule 6 applies — if we show a rank, we must be
 * able to justify it.
 */
export const MIN_COMPETITORS_TO_SHOW_BOARD = 20;

/**
 * Every hypothesis in one object, for diagnostics, admin surfaces, and the
 * "why does this number say that?" explanations required by Core rule 6.
 */
export const HYPOTHESES = {
  UNLOCK_THRESHOLD,
  DIVISION_SIZE,
  PROMOTE_COUNT,
  RELEGATE_COUNT,
  TARGET_ENTRY_TO_FAN_RATIO,
  MAX_VIEWS_PER_ENTRY,
  PROVISIONAL_RD_THRESHOLD,
  MIN_COMPETITORS_TO_SHOW_BOARD,
} as const;

export type HypothesisName = keyof typeof HYPOTHESES;
