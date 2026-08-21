/**
 * The copy rules, enforced across every user-facing surface.
 *
 * This walks `app/` and `components/`, extracts the text a user would actually read — JSX
 * text nodes and the props that render as prose — and holds it to the rules in
 * `lib/design/copy.ts`.
 *
 * Comments are stripped first, on purpose. "This is where a naive implementation failed"
 * is a useful thing to write in a comment and not something a user will ever see; the
 * rule is about the product's voice, not the codebase's.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertSystemCopy, findCopyViolations } from '@/lib/design/copy';

const ROOT = process.cwd();
const SURFACES = ['app', 'components'];

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return path.endsWith('.tsx') ? [path] : [];
    }),
  );
  return files.flat();
}

/** Removes block and line comments so developer prose is not treated as product copy. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Extracts what a user reads: JSX text nodes, plus the props that render as prose.
 *
 * Not a parser. It is deliberately conservative — it would rather miss a string than
 * flag a variable name — because a copy test that cries wolf gets deleted.
 */
function userFacingStrings(source: string): string[] {
  const clean = stripComments(source);
  const found: string[] = [];

  // JSX text between tags: >Season 3 closes Sunday<
  for (const match of clean.matchAll(/>([^<>{}]+)</g)) {
    const text = match[1]?.trim();
    if (text !== undefined && /[a-z]{3}/i.test(text)) found.push(text);
  }

  // Props that end up on screen or in an accessible name.
  const proseProps =
    /\b(title|description|label|caption|placeholder|aria-label|remainingLabel|closesLabel)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of clean.matchAll(proseProps)) {
    const text = (match[2] ?? match[3])?.trim();
    if (text !== undefined && /[a-z]{3}/i.test(text)) found.push(text);
  }

  return found;
}

describe('findCopyViolations', () => {
  it('catches the three banned words', () => {
    expect(findCopyViolations('You lost this round')).toHaveLength(1);
    expect(findCopyViolations('Upload failed')).toHaveLength(1);
    expect(findCopyViolations('Your worst result')).toHaveLength(1);
  });

  it('does not fire on words that merely contain them', () => {
    // "closest" contains "lost". A naive substring check would fail this.
    expect(findCopyViolations('The closest match')).toHaveLength(0);
    expect(findCopyViolations('Unclassified')).toHaveLength(0);
  });

  it('catches slang', () => {
    expect(findCopyViolations('You absolutely slay')).toHaveLength(1);
    expect(findCopyViolations('Big vibes this season')).toHaveLength(1);
  });

  it('catches emoji', () => {
    expect(findCopyViolations('Nice work 🎉')).toHaveLength(1);
    expect(findCopyViolations('Rating up ✨')).toHaveLength(1);
  });

  it('permits the typographic marks the interface actually uses', () => {
    expect(findCopyViolations('Season 3 closes Sunday · 4 days left')).toHaveLength(0);
    expect(findCopyViolations('1440–1560 · provisional')).toHaveLength(0);
    expect(findCopyViolations('−8 rating')).toHaveLength(0);
  });

  it('accepts the alternatives we actually use instead', () => {
    expect(findCopyViolations('Down 8 rating')).toHaveLength(0);
    expect(findCopyViolations('Not eligible for this brief')).toHaveLength(0);
    expect(findCopyViolations('Moved down a division')).toHaveLength(0);
  });
});

describe('assertSystemCopy', () => {
  it('names the offending word and where it came from', () => {
    expect(() => assertSystemCopy('You failed', 'toast')).toThrow(/toast.*failed/s);
  });

  it('stays quiet on acceptable copy', () => {
    expect(() => assertSystemCopy('Vote recorded', 'toast')).not.toThrow();
  });
});

describe('every user-facing string in the product', () => {
  it('obeys the copy rules', async () => {
    const dirs = SURFACES.map((dir) => resolve(ROOT, dir));
    const files = (await Promise.all(dirs.map(sourceFiles))).flat();

    expect(files.length, 'found no .tsx files to check').toBeGreaterThan(0);

    const failures: string[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const text of userFacingStrings(source)) {
        for (const violation of findCopyViolations(text)) {
          failures.push(
            `${relative(ROOT, file)}: ${violation.kind} "${violation.match}" in "${text}"`,
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
