/**
 * THE AGE POLICY. All of it. There is no other file.
 *
 * Core rule 7 says users may be minors and demands strict handling of their data. The
 * prompt pack is blunt about the mechanism: "All of this lives in ONE module ... Do not
 * scatter age checks." That instruction is the important part. An age check copied into a
 * profile page, a leaderboard query and a notification job is three places to be right
 * and three places to drift, and the failure mode is a thirteen-year-old's city rendered
 * on a public page because one of them was missed.
 *
 * So: if you are about to write `age >= 18` anywhere else in this codebase, stop and add
 * a field to `MinorPolicy` instead.
 *
 * Framework-free. These are domain rules and they are unit-tested without a request, a
 * database or a browser in scope.
 *
 * `lib/domain/age.ts` sits underneath this and does date arithmetic only. It is not the
 * policy and should not be imported for policy questions.
 */

import { MIN_SIGNUP_AGE } from '@/lib/config/hypotheses';
import { ADULT_AGE, ageInYears } from '@/lib/domain/age';

export { ADULT_AGE, MIN_SIGNUP_AGE };

/**
 * Which side of the two lines a person falls on.
 *
 * `unknown` is not the same as `blocked`. Before onboarding collects a date of birth we
 * do not know, and Core rule 7 says an unknown must be treated with a minor's
 * protections — but it must NOT be treated as a rejected signup, because the user has
 * simply not answered yet.
 */
export type AgeBand = 'unknown' | 'invalid' | 'blocked' | 'minor' | 'adult';

export type AgeAssessment = {
  band: AgeBand;
  /** Whole years, or null when the date of birth is missing or unusable. */
  age: number | null;
};

/**
 * What a person in a given band may do and be shown.
 *
 * Every one of these is a `false` that has to be honoured somewhere in the product. They
 * are named for what is ALLOWED rather than what is forbidden, so a caller that forgets
 * to check reads as `if (policy.canX)` and fails closed when the object is missing.
 */
export type MinorPolicy = {
  /** May hold an account at all. */
  canHoldAccount: boolean;
  /** Core rule 7: no contact surface between judges and minors. */
  canBeContactedByJudges: boolean;
  /** City is a location. A minor's location is not public. */
  canShowCityPublicly: boolean;
  /** Full name, links, anything free-text a stranger could use to find someone. */
  canShowFullProfilePublicly: boolean;
  /** Appearing on a public, linkable ranking outside their own division. */
  canAppearOnPublicLeaderboard: boolean;
  /** Receiving anything that is not about their own entries or their own session. */
  canReceiveSocialNotifications: boolean;
  /** Treated as a minor for every purpose not listed above. */
  isMinor: boolean;
};

const MINOR_POLICY: MinorPolicy = {
  canHoldAccount: true,
  canBeContactedByJudges: false,
  canShowCityPublicly: false,
  canShowFullProfilePublicly: false,
  canAppearOnPublicLeaderboard: false,
  canReceiveSocialNotifications: false,
  isMinor: true,
};

const ADULT_POLICY: MinorPolicy = {
  canHoldAccount: true,
  canBeContactedByJudges: true,
  canShowCityPublicly: true,
  canShowFullProfilePublicly: true,
  canAppearOnPublicLeaderboard: true,
  canReceiveSocialNotifications: true,
  isMinor: false,
};

/** Nothing is permitted. Used for a blocked signup and for an unusable date of birth. */
const NO_ACCOUNT_POLICY: MinorPolicy = {
  canHoldAccount: false,
  canBeContactedByJudges: false,
  canShowCityPublicly: false,
  canShowFullProfilePublicly: false,
  canAppearOnPublicLeaderboard: false,
  canReceiveSocialNotifications: false,
  isMinor: true,
};

/**
 * Classify a date of birth.
 *
 * **Timezones.** A date of birth is a calendar date, not an instant, and "how old are you
 * today" has a different answer either side of midnight depending on where you are
 * standing. Everything here is computed in UTC, deliberately, which means a user in
 * Chennai who turns 13 at midnight local time is still 12 to us for the first five and a
 * half hours of their birthday.
 *
 * That is the direction we want to be wrong in. Rounding down delays a birthday by less
 * than a day; rounding up would let a twelve-year-old in and would do it silently.
 * `tests/unit/minor-policy.test.ts` pins this behaviour so it cannot be "fixed" by
 * accident.
 */
export function assessAge(
  dob: Date | string | null | undefined,
  asOf: Date = new Date(),
): AgeAssessment {
  if (dob === null || dob === undefined || dob === '') {
    return { band: 'unknown', age: null };
  }

  const age = ageInYears(dob, asOf);
  if (age === null) return { band: 'invalid', age: null };

  // A date of birth in the future is not a young user, it is bad input — from a typo, a
  // clock skew, or someone probing. Either way it must not be treated as an age.
  if (age < 0) return { band: 'invalid', age: null };

  if (age < MIN_SIGNUP_AGE) return { band: 'blocked', age };
  if (age < ADULT_AGE) return { band: 'minor', age };
  return { band: 'adult', age };
}

/** The policy for a band. The only way to get one. */
export function policyForBand(band: AgeBand): MinorPolicy {
  switch (band) {
    case 'adult':
      return ADULT_POLICY;
    case 'minor':
      // An unknown age is treated as a minor for protection purposes, but unlike a
      // blocked one it may still hold an account — the user has not answered yet.
      return MINOR_POLICY;
    case 'unknown':
      return MINOR_POLICY;
    case 'blocked':
    case 'invalid':
      return NO_ACCOUNT_POLICY;
  }
}

/** The common path: a date of birth in, a policy out. */
export function policyForDateOfBirth(
  dob: Date | string | null | undefined,
  asOf: Date = new Date(),
): MinorPolicy {
  return policyForBand(assessAge(dob, asOf).band);
}

/**
 * Core rule 7's default. An unknown date of birth is a minor.
 *
 * This is the function the rest of the codebase should call. It is re-exported through
 * the policy module rather than taken from `lib/domain/age.ts` directly so that there is
 * one import path for age questions and one place to change the answer.
 */
export function isMinor(dob: Date | string | null | undefined, asOf: Date = new Date()): boolean {
  return policyForDateOfBirth(dob, asOf).isMinor;
}

/** May this date of birth open an account? */
export function canSignUp(dob: Date | string | null | undefined, asOf: Date = new Date()): boolean {
  return policyForDateOfBirth(dob, asOf).canHoldAccount;
}

/**
 * Why a signup was refused, in words a thirteen-year-old and their parent can both read.
 *
 * Deliberately not an error code and deliberately not accusatory: someone who is twelve
 * has done nothing wrong, and the copy rules forbid "failed" anywhere near this.
 */
export function signupRefusalMessage(band: AgeBand): string | null {
  switch (band) {
    case 'blocked':
      return `Arena is for people aged ${MIN_SIGNUP_AGE} and over. Come back when you are ${MIN_SIGNUP_AGE}, and thank you for stopping by.`;
    case 'invalid':
      return 'That date of birth does not look right. Please check it and try again.';
    case 'unknown':
      return 'Please enter your date of birth to continue.';
    case 'minor':
    case 'adult':
      return null;
  }
}
