/**
 * `app/tokens.css` must be exactly what `lib/design/tokens.ts` generates.
 *
 * Two sources of truth for a palette is the oldest way to end up with a design system
 * nobody trusts: the TypeScript says one thing, the stylesheet says another, and the
 * component library quietly follows whichever it imported. This test makes that
 * impossible to commit.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderTokensCss } from '@/lib/design/css';
import { categoryAccents, MIN_TOUCH_TARGET_PX } from '@/lib/design/tokens';

const tokensCss = (): Promise<string> => readFile(resolve(process.cwd(), 'app/tokens.css'), 'utf8');

describe('generated tokens', () => {
  it('matches lib/design/tokens.ts — run `npm run design:tokens` if this fails', async () => {
    expect(await tokensCss()).toBe(renderTokensCss());
  });

  it('emits a selector for every category accent ramp', async () => {
    const css = await tokensCss();

    for (const slug of Object.keys(categoryAccents)) {
      if (slug === 'default') continue;
      expect(css, `no rule for data-category='${slug}'`).toContain(`[data-category='${slug}']`);
    }
  });

  it('defines the accent variables at :root, so a page with no category still works', async () => {
    const css = await tokensCss();
    const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('}'));

    expect(rootBlock).toContain('--arena-accent-base');
    expect(rootBlock).toContain('--arena-accent-on-accent');
  });

  it('keeps light as the default theme with no prefers-color-scheme switch', async () => {
    const css = await tokensCss();

    // Decided in Prompt 0: older users overwhelmingly prefer light, so dark is opt-in.
    expect(css).not.toContain('prefers-color-scheme');
    expect(css).toContain('.dark {');
  });

  it('drives the type scale from one custom property', async () => {
    const css = await tokensCss();

    // This is what makes 200% dynamic type a one-line change rather than a redesign.
    expect(css).toContain('--arena-font-root: 1rem;');
    expect(css).toContain('--arena-text-base: calc(var(--arena-font-root) * 1);');
  });
});

describe('the touch target floor', () => {
  it('is 48px, and globals.css enforces it on interactive primitives', async () => {
    expect(MIN_TOUCH_TARGET_PX).toBe(48);

    const globals = await readFile(resolve(process.cwd(), 'app/globals.css'), 'utf8');
    expect(globals).toContain('--arena-touch-target: 48px');
  });
});
