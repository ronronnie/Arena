/**
 * How much a judge's vote counts.
 *
 * Core rule 2 says ranking comes from head-to-head comparisons — but not every comparison
 * is worth the same, and this is where that is decided. Two inputs today:
 *
 *   - **Phone verification.** The cheapest real friction against one person running
 *     several accounts. An optional step, never required, and it is the only thing in
 *     Arena that asks for a phone number at all.
 *   - **Judge calibration.** How closely a judge tracks the expert panel and consensus.
 *     Computed by Prompt 13; until then every judge sits at 1.0.
 *
 * Both multipliers live in `lib/config/hypotheses.ts` because both are guesses.
 *
 * Framework-free. The rating engine (Prompt 10) and vote integrity (Prompt 14) both need
 * this and neither should reimplement it.
 */

import { PHONE_VERIFIED_VOTE_WEIGHT } from '@/lib/config/hypotheses';

export type VoteWeightInputs = {
  phoneVerified: boolean;
  /**
   * Judge calibration multiplier, 0 to ~2. Defaults to 1 — an uncalibrated judge counts
   * normally rather than counting for nothing, because everyone starts uncalibrated and
   * a new judge's first sessions have to be worth something.
   */
  calibrationWeight?: number;
};

/** The floor and ceiling. A single judge must never be able to decide a drop alone. */
export const MIN_VOTE_WEIGHT = 0;
export const MAX_VOTE_WEIGHT = 3;

/**
 * The weight to store on a comparison at the moment it is decided.
 *
 * Recorded per comparison rather than derived at read time on purpose: a judge who
 * verifies their phone next week should not retroactively change the weight of votes they
 * cast today. `comparisons.voter_weight` is a fact about that vote, not about that judge.
 */
export function voteWeight({ phoneVerified, calibrationWeight = 1 }: VoteWeightInputs): number {
  const verification = phoneVerified ? PHONE_VERIFIED_VOTE_WEIGHT : 1;
  const calibration = Number.isFinite(calibrationWeight) ? calibrationWeight : 1;

  const weight = verification * Math.max(0, calibration);
  return Math.min(MAX_VOTE_WEIGHT, Math.max(MIN_VOTE_WEIGHT, Number(weight.toFixed(4))));
}

/**
 * Plain-language account of a vote weight, for Core rule 6.
 *
 * Every number shown to a user opens an explanation, and "your vote counts 1.25x" is
 * exactly the kind of number that feels arbitrary until it is spelled out.
 */
export function explainVoteWeight({
  phoneVerified,
  calibrationWeight = 1,
}: VoteWeightInputs): string[] {
  const reasons: string[] = ['Every judged comparison starts at one.'];

  if (phoneVerified) {
    reasons.push(
      `Your phone is verified, so your vote counts ${PHONE_VERIFIED_VOTE_WEIGHT} times as much. Verifying makes it harder for one person to vote from several accounts.`,
    );
  } else {
    reasons.push(
      `Verifying your phone would raise this to ${PHONE_VERIFIED_VOTE_WEIGHT}. It is optional, and you can judge as much as you like without it.`,
    );
  }

  if (calibrationWeight > 1) {
    reasons.push('Your choices track the expert panel closely, which raises your weight.');
  } else if (calibrationWeight < 1) {
    reasons.push('Your weight is still settling while we learn how you judge.');
  }

  return reasons;
}
