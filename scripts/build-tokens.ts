/**
 * Writes `app/tokens.css` from `lib/design/tokens.ts`.
 *
 * Run it after changing any token: `npm run design:tokens`. If you forget,
 * `tests/unit/tokens-sync.test.ts` will tell you — that is the whole point of having a
 * generator rather than two hand-maintained copies of the palette.
 */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderTokensCss } from '../lib/design/css';

const OUT = resolve(process.cwd(), 'app/tokens.css');

async function main(): Promise<void> {
  await writeFile(OUT, renderTokensCss(), 'utf8');
  console.log(`Wrote ${OUT}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
