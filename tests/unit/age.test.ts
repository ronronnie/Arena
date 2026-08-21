/**
 * Core rule 7 lives or dies on this function, so it gets more tests than its size
 * suggests it deserves.
 */

import { describe, expect, it } from 'vitest';
import { ADULT_AGE, ageInYears, isMinor } from '@/lib/domain/age';

const asOf = new Date('2026-08-22T12:00:00Z');

describe('ageInYears', () => {
  it('counts whole years', () => {
    expect(ageInYears('2000-01-01', asOf)).toBe(26);
  });

  it('does not count a birthday that has not happened yet this year', () => {
    expect(ageInYears('2000-12-31', asOf)).toBe(25);
  });

  it('counts a birthday that is today', () => {
    expect(ageInYears('2008-08-22', asOf)).toBe(18);
  });

  it('does not count a birthday one day away', () => {
    expect(ageInYears('2008-08-23', asOf)).toBe(17);
  });

  it('accepts a Date as well as a Postgres date string', () => {
    expect(ageInYears(new Date('1990-06-05T00:00:00Z'), asOf)).toBe(36);
  });

  it('returns null when the date of birth is unknown', () => {
    expect(ageInYears(null, asOf)).toBeNull();
    expect(ageInYears(undefined, asOf)).toBeNull();
  });

  it('returns null for an unparseable value rather than guessing', () => {
    expect(ageInYears('not a date', asOf)).toBeNull();
  });
});

describe('isMinor', () => {
  it('treats an UNKNOWN date of birth as a minor', () => {
    // This is the whole point of the function. Before onboarding collects a date of birth
    // every user is unknown, and the two possible mistakes do not cost the same.
    expect(isMinor(null, asOf)).toBe(true);
    expect(isMinor(undefined, asOf)).toBe(true);
  });

  it('treats an unparseable date of birth as a minor', () => {
    expect(isMinor('', asOf)).toBe(true);
    expect(isMinor('yesterday', asOf)).toBe(true);
  });

  it('is true below the adult age', () => {
    expect(isMinor('2009-01-01', asOf)).toBe(true);
  });

  it('is false at exactly the adult age', () => {
    expect(isMinor('2008-08-22', asOf)).toBe(false);
  });

  it('is true the day before turning adult', () => {
    expect(isMinor('2008-08-23', asOf)).toBe(true);
  });

  it('uses 18 as the adult age', () => {
    expect(ADULT_AGE).toBe(18);
  });
});
