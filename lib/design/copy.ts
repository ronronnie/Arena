/**
 * Copy rules, as data.
 *
 * The design direction says "no slang, no emoji in system copy", and the prompt pack asks
 * for three words to be absent from user-facing text entirely. Both are enforced by
 * `tests/unit/copy-rules.test.ts` rather than left to review, because tone is exactly the
 * kind of thing that erodes one well-meaning string at a time.
 *
 * Framework-free: this is a list and two functions.
 */

/**
 * Words that never appear in text a user reads.
 *
 * These are not banned because they are rude. They are banned because Arena is a
 * competition where most participants will not come first, and the product only works if
 * placing eleventh out of thirty feels like a season rather than a verdict. "Lost" and
 * "failed" describe a person; "down 8" and "not eligible" describe a state. Core rule 5
 * exists so that most people can win somewhere, and the vocabulary has to agree with it.
 */
export const BANNED_WORDS = ['lost', 'failed', 'worst'] as const;

/**
 * Slang that age-codes the product.
 *
 * The whole age thesis is that a fifteen-year-old and a forty-five-year-old classical
 * dancer end up in the same app. One "slay" in a toast and the forty-five-year-old knows
 * it was not built for her.
 */
export const BANNED_SLANG = [
  'slay',
  'vibes',
  'lit',
  'yeet',
  'sus',
  'lowkey',
  'bestie',
  'goated',
  'rizz',
  'no cap',
] as const;

/**
 * Emoji and pictographs.
 *
 * Deliberately covers the pictographic ranges only. Arrows, dashes and typographic marks
 * are fine — the interface uses them — and the middle dot in "Season 3 closes Sunday · 4
 * days left" must not be flagged.
 */
export const EMOJI_PATTERN =
  /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}\u{2600}-\u{27BF}\u{FE0F}\u{1F900}-\u{1F9FF}]/u;

export type CopyViolation = { kind: 'banned-word' | 'slang' | 'emoji'; match: string };

/** Returns every rule the given user-facing string breaks. Empty means it is fine. */
export function findCopyViolations(text: string): CopyViolation[] {
  const violations: CopyViolation[] = [];

  for (const word of BANNED_WORDS) {
    // Word boundaries: "lost" must not match "closest".
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) {
      violations.push({ kind: 'banned-word', match: word });
    }
  }

  for (const phrase of BANNED_SLANG) {
    if (new RegExp(`\\b${phrase}\\b`, 'i').test(text)) {
      violations.push({ kind: 'slang', match: phrase });
    }
  }

  const emoji = EMOJI_PATTERN.exec(text);
  if (emoji !== null) {
    violations.push({ kind: 'emoji', match: emoji[0] });
  }

  return violations;
}

/** Throws on the first violation. For copy assembled at runtime. */
export function assertSystemCopy(text: string, where: string): void {
  const violations = findCopyViolations(text);
  if (violations.length === 0) return;

  const detail = violations.map((v) => `${v.kind} "${v.match}"`).join(', ');
  throw new Error(`System copy in ${where} breaks the copy rules: ${detail} — in "${text}"`);
}
