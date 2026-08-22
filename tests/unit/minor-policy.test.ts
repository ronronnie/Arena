/**
 * The age gate.
 *
 * The prompt pack names the cases it wants: "exactly 13 today, exactly 18 today, timezone
 * edges, future DOB". They are all here, plus the one the pack does not name and that
 * matters most — an UNKNOWN date of birth, which is the state every user is in between
 * signing up and finishing onboarding.
 *
 * Core rule 7 makes this the highest-stakes pure function in the codebase. Getting it
 * wrong in one direction delays somebody's birthday by a few hours. Getting it wrong in
 * the other puts a twelve-year-old in a product with adults in it.
 */

import { describe, expect, it } from 'vitest';
import { MIN_SIGNUP_AGE } from '@/lib/config/hypotheses';
import {
  assessAge,
  canSignUp,
  isMinor,
  policyForBand,
  policyForDateOfBirth,
  signupRefusalMessage,
} from '@/lib/policy/minorPolicy';

/** Midday UTC, so a test is not accidentally sitting on a boundary of its own. */
const today = new Date('2026-08-22T12:00:00Z');

/** The date of birth of someone who turns `years` old exactly today. */
const bornExactly = (years: number): string => {
  const d = new Date(today);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
};

describe('the two boundaries', () => {
  it('admits someone who turns 13 today', () => {
    const assessment = assessAge(bornExactly(13), today);
    expect(assessment).toEqual({ band: 'minor', age: 13 });
    expect(canSignUp(bornExactly(13), today)).toBe(true);
  });

  it('refuses someone who turns 13 tomorrow', () => {
    // One day short. The whole point of the gate.
    const dayBefore = '2013-08-23';
    expect(assessAge(dayBefore, today)).toEqual({ band: 'blocked', age: 12 });
    expect(canSignUp(dayBefore, today)).toBe(false);
  });

  it('treats someone who turns 18 today as an adult', () => {
    const assessment = assessAge(bornExactly(18), today);
    expect(assessment).toEqual({ band: 'adult', age: 18 });
    expect(isMinor(bornExactly(18), today)).toBe(false);
  });

  it('treats someone who turns 18 tomorrow as a minor', () => {
    const dayBefore = '2008-08-23';
    expect(assessAge(dayBefore, today)).toEqual({ band: 'minor', age: 17 });
    expect(isMinor(dayBefore, today)).toBe(true);
  });

  it('uses MIN_SIGNUP_AGE rather than a hardcoded 13', () => {
    expect(MIN_SIGNUP_AGE).toBe(13);
    expect(assessAge(bornExactly(MIN_SIGNUP_AGE - 1), today).band).toBe('blocked');
    expect(assessAge(bornExactly(MIN_SIGNUP_AGE), today).band).toBe('minor');
  });
});

describe('timezone edges', () => {
  /*
   * A date of birth is a calendar date; "how old are you today" changes at midnight, and
   * midnight is not the same instant everywhere. We compute in UTC and therefore round
   * DOWN — a user in Chennai (UTC+5:30) is still 12 to us for the first five and a half
   * hours of their thirteenth birthday.
   *
   * These tests pin that on purpose. If someone later "fixes" it to use local time, the
   * gate starts admitting twelve-year-olds for a few hours a day.
   */
  it('is still 12 just after local midnight in UTC+5:30', () => {
    // 18:35 UTC on the 22nd is 00:05 on the 23rd in Chennai — their birthday has started
    // locally, but not in UTC.
    const justAfterLocalMidnight = new Date('2026-08-22T18:35:00Z');
    expect(assessAge('2013-08-23', justAfterLocalMidnight).age).toBe(12);
    expect(canSignUp('2013-08-23', justAfterLocalMidnight)).toBe(false);
  });

  it('turns 13 once the date turns over in UTC', () => {
    const utcMidnight = new Date('2026-08-23T00:00:00Z');
    expect(assessAge('2013-08-23', utcMidnight).age).toBe(13);
    expect(canSignUp('2013-08-23', utcMidnight)).toBe(true);
  });

  it('is unmoved by a timestamp on the date of birth itself', () => {
    // Postgres hands back 'YYYY-MM-DD'; a client might send a full ISO instant. Both must
    // classify identically, or the answer depends on how the value happened to travel.
    expect(assessAge('2008-08-22', today).age).toBe(assessAge('2008-08-22T23:59:59Z', today).age);
  });

  it('does not shift a birthday across a UTC day boundary for a late-evening instant', () => {
    const lateEvening = new Date('2026-08-22T23:59:59Z');
    expect(assessAge(bornExactly(18), lateEvening).band).toBe('adult');
  });
});

describe('a date of birth that is not usable', () => {
  it('rejects a future date of birth as invalid, not as a young user', () => {
    const future = '2030-01-01';
    expect(assessAge(future, today)).toEqual({ band: 'invalid', age: null });
    expect(canSignUp(future, today)).toBe(false);
    // Crucially NOT 'blocked' — the message a user sees should be "check that date",
    // not "you are too young", because they are not.
    expect(signupRefusalMessage('invalid')).toMatch(/does not look right/);
  });

  it('rejects a date of birth one day in the future', () => {
    expect(assessAge('2026-08-23', today).band).toBe('invalid');
  });

  it('rejects unparseable input', () => {
    expect(assessAge('not a date', today).band).toBe('invalid');
    expect(assessAge('22/08/2008', today).band).toBe('invalid');
  });

  it('treats a missing date of birth as unknown, and unknown as a minor', () => {
    for (const value of [null, undefined, '']) {
      const assessment = assessAge(value, today);
      expect(assessment).toEqual({ band: 'unknown', age: null });
      // Unknown may still hold an account — they simply have not answered yet — but is
      // protected as a minor until they do.
      expect(policyForBand(assessment.band).canHoldAccount).toBe(true);
      expect(isMinor(value, today)).toBe(true);
    }
  });
});

describe('what each band may do', () => {
  it('gives a minor no contact surface and no public location', () => {
    const policy = policyForDateOfBirth(bornExactly(15), today);

    expect(policy.isMinor).toBe(true);
    expect(policy.canHoldAccount).toBe(true);
    expect(policy.canBeContactedByJudges).toBe(false);
    expect(policy.canShowCityPublicly).toBe(false);
    expect(policy.canShowFullProfilePublicly).toBe(false);
    expect(policy.canAppearOnPublicLeaderboard).toBe(false);
    expect(policy.canReceiveSocialNotifications).toBe(false);
  });

  it('gives an adult the full surface', () => {
    const policy = policyForDateOfBirth(bornExactly(30), today);

    expect(policy.isMinor).toBe(false);
    expect(policy.canBeContactedByJudges).toBe(true);
    expect(policy.canShowCityPublicly).toBe(true);
    expect(policy.canAppearOnPublicLeaderboard).toBe(true);
  });

  it('grants an unknown age exactly a minor’s permissions', () => {
    // If these ever diverge, an account mid-onboarding gets a surface it should not have.
    expect(policyForBand('unknown')).toEqual(policyForBand('minor'));
  });

  it('grants a blocked or invalid age nothing at all', () => {
    for (const band of ['blocked', 'invalid'] as const) {
      const policy = policyForBand(band);
      expect(policy.canHoldAccount).toBe(false);
      expect(Object.values(policy).filter((v) => v === true)).toEqual([policy.isMinor]);
    }
  });
});

describe('the refusal message', () => {
  it('is plain and not accusatory for a young user', () => {
    const message = signupRefusalMessage('blocked') ?? '';
    expect(message).toContain(String(MIN_SIGNUP_AGE));
    // The copy rules ban this vocabulary product-wide; it matters most right here.
    expect(message.toLowerCase()).not.toMatch(/\b(failed|denied|rejected|sorry)\b/);
  });

  it('is absent for anyone who may sign up', () => {
    expect(signupRefusalMessage('minor')).toBeNull();
    expect(signupRefusalMessage('adult')).toBeNull();
  });
});
