/**
 * Handle rules.
 *
 * A handle is the one piece of a competitor's identity that appears next to their rating,
 * on a result card, and in a reveal — so it is chosen once, in onboarding, and it is
 * public by definition. Two consequences shape the rules below:
 *
 *   1. **It must not be able to carry personal information by accident.** Core rule 7
 *      means a fifteen-year-old is choosing this, and "sarah_chennai_2011" is a location
 *      and a birth year attached to a child. We cannot stop someone typing that, but we
 *      can keep the field short and say plainly what it is for.
 *   2. **It must not be confusable.** A handle that renders identically to another
 *      handle is an impersonation vector on a product whose entire proposition is that
 *      the ranking is trustworthy.
 *
 * Framework-free, so onboarding, the data-access layer and any future moderation tool all
 * apply exactly the same rule.
 */

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;

/** Lowercase letters, digits and single interior underscores. Nothing else. */
const HANDLE_PATTERN = /^[a-z0-9](?:_?[a-z0-9])*$/;

/**
 * Handles nobody may take.
 *
 * Not a moderation list — that is Prompt 15's problem and needs a much larger vocabulary.
 * This is the narrow set that would let someone pose as part of the product itself.
 */
const RESERVED = new Set([
  'arena',
  'admin',
  'administrator',
  'moderator',
  'mod',
  'staff',
  'support',
  'help',
  'official',
  'judge',
  'judges',
  'system',
  'root',
  'api',
  'auth',
  'login',
  'signin',
  'signup',
  'settings',
  'vote',
  'voting',
  'season',
  'division',
  'leaderboard',
  'me',
  'you',
  'null',
  'undefined',
]);

export type HandleProblem =
  | 'too-short'
  | 'too-long'
  | 'invalid-characters'
  | 'edge-underscore'
  | 'double-underscore'
  | 'reserved';

/** Human-readable, and non-accusatory. These are shown directly in onboarding. */
export const handleProblemMessage: Record<HandleProblem, string> = {
  'too-short': `Handles are at least ${HANDLE_MIN_LENGTH} characters.`,
  'too-long': `Handles are at most ${HANDLE_MAX_LENGTH} characters.`,
  'invalid-characters': 'Use lowercase letters, numbers and underscores only.',
  'edge-underscore': 'Handles cannot start or end with an underscore.',
  'double-underscore': 'Use one underscore at a time.',
  reserved: 'That handle is kept for Arena itself. Please pick another.',
};

/**
 * Normalise before validating or storing.
 *
 * Case-folding is what makes uniqueness meaningful: without it `Meera` and `meera` are two
 * different rows and one of them is pretending to be the other. Unicode normalisation
 * closes the same hole for composed characters.
 */
export function normaliseHandle(input: string): string {
  return input.normalize('NFKC').trim().toLowerCase();
}

/** Returns every rule the handle breaks, in the order a user would want to fix them. */
export function validateHandle(input: string): HandleProblem[] {
  const handle = normaliseHandle(input);
  const problems: HandleProblem[] = [];

  if (handle.length < HANDLE_MIN_LENGTH) problems.push('too-short');
  if (handle.length > HANDLE_MAX_LENGTH) problems.push('too-long');

  if (handle.startsWith('_') || handle.endsWith('_')) problems.push('edge-underscore');
  if (handle.includes('__')) problems.push('double-underscore');

  // Checked last so the specific underscore messages win when both apply.
  if (
    !HANDLE_PATTERN.test(handle) &&
    !problems.includes('edge-underscore') &&
    !problems.includes('double-underscore')
  ) {
    problems.push('invalid-characters');
  }

  if (RESERVED.has(handle)) problems.push('reserved');

  return problems;
}

export function isValidHandle(input: string): boolean {
  return validateHandle(input).length === 0;
}

/** The first problem's message, for a single-line field error. */
export function firstHandleProblemMessage(input: string): string | null {
  const problem = validateHandle(input)[0];
  return problem === undefined ? null : handleProblemMessage[problem];
}
