/**
 * Renders `lib/design/tokens.ts` to CSS custom properties.
 *
 * Lives in `/lib` rather than in `/scripts` for one reason: the drift test needs to call
 * it. `scripts/build-tokens.ts` writes the output to `app/tokens.css`, and
 * `tests/unit/tokens-sync.test.ts` regenerates it and compares — so a token edited in
 * TypeScript without regenerating the CSS fails `npm run check` rather than silently
 * shipping a stylesheet that disagrees with its own source of truth.
 *
 * Framework-free. It returns a string.
 */

import {
  categoryAccents,
  durations,
  easings,
  elevation,
  fontWeights,
  letterSpacing,
  lineHeights,
  radii,
  spacing,
  themes,
  tierColors,
  typeScale,
  type AccentRamp,
  type ThemeColors,
} from './tokens';

const HEADER = `/*
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source of truth: lib/design/tokens.ts
 * Regenerate:      npm run design:tokens
 *
 * tests/unit/tokens-sync.test.ts fails if this file and the tokens disagree, so editing
 * it by hand will be caught rather than quietly kept.
 */`;

const colorVars = (colors: ThemeColors, indent: string): string =>
  Object.entries(colors)
    .map(([name, value]) => `${indent}--arena-${kebab(name)}: ${value};`)
    .join('\n');

const accentVars = (ramp: AccentRamp, indent: string): string =>
  Object.entries(ramp)
    .map(([name, value]) => `${indent}--arena-accent-${kebab(name)}: ${value};`)
    .join('\n');

function kebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function renderTokensCss(): string {
  const blocks: string[] = [HEADER, ''];

  /* ---- Light, the default. There is deliberately no prefers-color-scheme switch: ----
   * older users overwhelmingly prefer light, so dark is opt-in via `.dark`. */
  blocks.push(':root {');
  blocks.push('  /* The one property the whole type scale hangs off. */');
  blocks.push('  --arena-font-root: 1rem;');
  blocks.push('');
  blocks.push(
    Object.entries(lineHeights)
      .map(([name, value]) => `  --arena-leading-${name}: ${value};`)
      .join('\n'),
  );
  blocks.push(
    Object.entries(letterSpacing)
      .map(([name, value]) => `  --arena-tracking-${name}: ${value};`)
      .join('\n'),
  );
  blocks.push(
    Object.entries(fontWeights)
      .map(([name, value]) => `  --arena-weight-${name}: ${value};`)
      .join('\n'),
  );
  blocks.push('');
  blocks.push(
    Object.entries(spacing)
      .map(([name, value]) => `  --arena-space-${name}: ${value};`)
      .join('\n'),
  );
  blocks.push(
    Object.entries(radii)
      .map(([name, value]) => `  --arena-radius-${name}: ${value};`)
      .join('\n'),
  );
  blocks.push(
    Object.entries(elevation)
      .map(([name, value]) => `  --arena-shadow-${name}: ${value};`)
      .join('\n'),
  );
  blocks.push('');
  blocks.push(
    Object.entries(durations)
      .map(([name, value]) => `  --arena-duration-${name}: ${value}ms;`)
      .join('\n'),
  );
  blocks.push(
    Object.entries(easings)
      .map(([name, value]) => `  --arena-ease-${name}: ${value};`)
      .join('\n'),
  );
  blocks.push('');
  blocks.push('  /* Light theme. */');
  blocks.push(colorVars(themes.light, '  '));
  blocks.push('');
  blocks.push(
    Object.entries(tierColors)
      .map(([name, value]) => `  --arena-tier-${name}: ${value.light};`)
      .join('\n'),
  );
  blocks.push('');
  blocks.push('  /* Accent, before any category is applied. */');
  const defaultRamp = categoryAccents['default'];
  if (defaultRamp === undefined) throw new Error('categoryAccents.default is required');
  blocks.push(accentVars(defaultRamp.light, '  '));
  blocks.push('}');
  blocks.push('');

  /*
   * The type scale, derived from --arena-font-root.
   *
   * Declared for BOTH :root and [data-arena-type-scope], and that repetition is
   * load-bearing rather than sloppy. A custom property that references another one is
   * resolved in the scope where it is DECLARED, so with these steps living only on :root,
   * overriding --arena-font-root further down the tree changes nothing — the steps have
   * already been computed against the root's value and are merely inherited.
   *
   * Re-declaring them on an opt-in attribute lets any subtree re-derive the whole scale
   * from its own root size. That is what /design-system uses to render at 150% and 200%,
   * and it is the same mechanism a future in-app text-size setting would need.
   */
  blocks.push(':root,');
  blocks.push('[data-arena-type-scope] {');
  blocks.push(
    Object.entries(typeScale)
      .map(([name, ratio]) => `  --arena-text-${name}: calc(var(--arena-font-root) * ${ratio});`)
      .join('\n'),
  );
  blocks.push('}');
  blocks.push('');
  blocks.push('/* A subtree that re-derives the scale must also restate its own body size. */');
  blocks.push('[data-arena-type-scope] {');
  blocks.push('  font-size: var(--arena-text-base);');
  blocks.push('}');
  blocks.push('');

  /* ---- Dark, opt-in. ---- */
  blocks.push('.dark {');
  blocks.push(colorVars(themes.dark, '  '));
  blocks.push('');
  blocks.push(
    Object.entries(tierColors)
      .map(([name, value]) => `  --arena-tier-${name}: ${value.dark};`)
      .join('\n'),
  );
  blocks.push('');
  blocks.push(accentVars(defaultRamp.dark, '  '));
  blocks.push('}');
  blocks.push('');

  /* ---- Per-category accent ramps, swapped at the root by `data-category`. ---- */
  blocks.push('/* Category theming. `data-category` on <html> re-themes the accent ramp. */');
  for (const [slug, ramp] of Object.entries(categoryAccents)) {
    if (slug === 'default') continue;
    blocks.push(`[data-category='${slug}'] {`);
    blocks.push(accentVars(ramp.light, '  '));
    blocks.push('}');
    blocks.push('');
    blocks.push(`.dark[data-category='${slug}'],`);
    blocks.push(`.dark [data-category='${slug}'] {`);
    blocks.push(accentVars(ramp.dark, '  '));
    blocks.push('}');
    blocks.push('');
  }

  return `${blocks.join('\n').trimEnd()}\n`;
}
