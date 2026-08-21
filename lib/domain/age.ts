/**
 * Age, and the one question Core rule 7 turns on: is this person a minor?
 *
 * Deliberately NOT a stored column. A stored `is_minor` is correct on the day it is
 * written and wrong the morning after a birthday, and "wrong for up to a year about
 * whether a user is a child" is not a defect we are willing to carry. It is derived here,
 * at read time, from the date of birth.
 *
 * Framework-free by design — this is a domain rule and must be testable without a
 * request, a database, or a browser.
 */

/** The age at which Arena stops applying minor protections. */
export const ADULT_AGE = 18;

/**
 * Whole years elapsed between `dob` and `asOf`. Returns null when the date of birth is
 * unknown — the caller must decide what to do about that, and `isMinor` decides safely.
 */
export function ageInYears(
  dob: Date | string | null | undefined,
  asOf: Date = new Date(),
): number | null {
  if (dob === null || dob === undefined) return null;

  const born = typeof dob === 'string' ? parseIsoDate(dob) : dob;
  if (born === null || Number.isNaN(born.getTime())) return null;

  let age = asOf.getUTCFullYear() - born.getUTCFullYear();

  // Not had this year's birthday yet? Then a year hasn't elapsed.
  const monthDelta = asOf.getUTCMonth() - born.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < born.getUTCDate())) {
    age -= 1;
  }

  return age;
}

/**
 * Core rule 7. **An unknown date of birth is a minor.**
 *
 * That default is the whole point of this function. Before onboarding collects a date of
 * birth (Prompt 3) every user is unknown, and the cost of the two possible mistakes is
 * not symmetric: treating an adult as a minor is an inconvenience, treating a minor as an
 * adult is the failure this product cannot have.
 */
export function isMinor(dob: Date | string | null | undefined, asOf: Date = new Date()): boolean {
  const age = ageInYears(dob, asOf);
  if (age === null) return true;
  return age < ADULT_AGE;
}

/** `YYYY-MM-DD` (what Postgres `date` hands back) parsed as UTC midnight. */
function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;

  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) return null;

  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}
