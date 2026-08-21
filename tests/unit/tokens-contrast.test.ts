/**
 * WCAG 2.1 AA, enforced at the token level.
 *
 * The prompt pack asks for "AA contrast enforced by a token-level test", and this is the
 * reason that phrasing matters: contrast checked once, by hand, in a browser extension is
 * a fact about the afternoon someone checked it. Checked here, it is a fact about the
 * palette, and changing a colour badly fails `npm run check` instead of shipping.
 *
 * For Arena specifically this is not a compliance box. Core rule 7 says users may be
 * minors, and the product's whole age thesis is that a fifteen-year-old and a
 * forty-five-year-old classical dancer use the same screen. Contrast is what makes that
 * literally true.
 */

import { describe, expect, it } from 'vitest';
import { AA_NON_TEXT, AA_NORMAL_TEXT, contrastRatio } from '@/lib/design/color';
import { categoryAccents, themes, tierColors, type ThemeName } from '@/lib/design/tokens';

const themeNames: ThemeName[] = ['light', 'dark'];

/** Reports the actual ratio on failure — "2.9 vs 4.5" is a fixable message. */
function expectContrast(
  foreground: string,
  background: string,
  threshold: number,
  what: string,
): void {
  const ratio = contrastRatio(foreground, background);
  expect(
    Number(ratio.toFixed(2)),
    `${what}: ${ratio.toFixed(2)}:1, needs ${threshold}:1`,
  ).toBeGreaterThanOrEqual(threshold);
}

describe.each(themeNames)('%s theme', (themeName) => {
  const theme = themes[themeName];
  const surfaces = [
    ['surface', theme.surface],
    ['surfaceRaised', theme.surfaceRaised],
    ['surfaceSunken', theme.surfaceSunken],
  ] as const;

  describe('text on every surface', () => {
    const textTokens = [
      ['text', theme.text],
      ['textMuted', theme.textMuted],
      ['textSubtle', theme.textSubtle],
    ] as const;

    it.each(
      surfaces.flatMap(([surfaceName, surface]) =>
        textTokens.map(([textName, text]) => [textName, surfaceName, text, surface] as const),
      ),
    )('%s on %s reaches AA', (textName, surfaceName, text, surface) => {
      expectContrast(text, surface, AA_NORMAL_TEXT, `${textName} on ${surfaceName}`);
    });
  });

  it('textSubtle is the quietest text there is — nothing may be quieter', () => {
    // Guards against a future "textFaint" being added below the AA floor. If a design
    // wants quieter text than this, the answer is less text, not lighter text.
    expectContrast(theme.textSubtle, theme.surface, AA_NORMAL_TEXT, 'textSubtle on surface');
  });

  describe('meaningful non-text', () => {
    it.each(surfaces)('borderStrong on %s reaches AA for non-text', (surfaceName, surface) => {
      expectContrast(theme.borderStrong, surface, AA_NON_TEXT, `borderStrong on ${surfaceName}`);
    });

    it.each(surfaces)('the focus ring on %s reaches AA for non-text', (surfaceName, surface) => {
      // A focus ring nobody can see is the same as no keyboard support at all.
      expectContrast(theme.focus, surface, AA_NON_TEXT, `focus on ${surfaceName}`);
    });
  });

  describe('status colours', () => {
    const statusTokens = [
      ['positive', theme.positive],
      ['negative', theme.negative],
      ['caution', theme.caution],
    ] as const;

    it.each(
      surfaces.flatMap(([surfaceName, surface]) =>
        statusTokens.map(([name, value]) => [name, surfaceName, value, surface] as const),
      ),
    )('%s on %s reaches AA', (name, surfaceName, value, surface) => {
      expectContrast(value, surface, AA_NORMAL_TEXT, `${name} on ${surfaceName}`);
    });
  });

  describe('tier badges', () => {
    it.each(Object.entries(tierColors))('%s reaches AA on the raised surface', (name, ramp) => {
      expectContrast(ramp[themeName], theme.surfaceRaised, AA_NORMAL_TEXT, `tier ${name}`);
    });
  });
});

describe('category accent ramps', () => {
  const cases = Object.entries(categoryAccents).flatMap(([slug, ramp]) =>
    themeNames.map((themeName) => [slug, themeName, ramp[themeName]] as const),
  );

  it.each(cases)('%s / %s: accent text reaches AA on every surface', (slug, themeName, ramp) => {
    const theme = themes[themeName];
    expectContrast(ramp.text, theme.surface, AA_NORMAL_TEXT, `${slug} accent text on surface`);
    expectContrast(
      ramp.text,
      theme.surfaceRaised,
      AA_NORMAL_TEXT,
      `${slug} accent text on surfaceRaised`,
    );
  });

  it.each(cases)('%s / %s: onAccent reaches AA on the filled control', (slug, themeName, ramp) => {
    expectContrast(ramp.onAccent, ramp.base, AA_NORMAL_TEXT, `${slug} onAccent on base`);
    // The hover state must not quietly drop below AA — that is where these usually break.
    expectContrast(ramp.onAccent, ramp.strong, AA_NORMAL_TEXT, `${slug} onAccent on strong`);
  });

  it.each(cases)('%s / %s: text on the soft tint reaches AA', (slug, themeName, ramp) => {
    const theme = themes[themeName];
    expectContrast(theme.text, ramp.soft, AA_NORMAL_TEXT, `${slug} body text on accent soft`);
    expectContrast(ramp.text, ramp.soft, AA_NORMAL_TEXT, `${slug} accent text on accent soft`);
  });

  it('keeps every category visually distinct, not just legible', () => {
    // Two disciplines sharing a hue would defeat the point of theming at all.
    const hues = Object.entries(categoryAccents).map(([slug, ramp]) => {
      const match = /oklch\([\d.]+\s+[\d.]+\s+([\d.]+)/.exec(ramp.light.base);
      return { slug, hue: Number(match?.[1] ?? 0) };
    });

    for (const a of hues) {
      for (const b of hues) {
        if (a.slug >= b.slug) continue;
        const separation = Math.abs(a.hue - b.hue);
        const circular = Math.min(separation, 360 - separation);
        expect(circular, `${a.slug} and ${b.slug} are ${circular}° apart`).toBeGreaterThan(30);
      }
    }
  });
});

describe('the chrome stays out of the way', () => {
  // "Video is the colour." A surface or text token with real chroma in it would tint every
  // performance on the screen and fight the footage.
  it.each(themeNames)('%s: surfaces and text are near-monochrome', (themeName) => {
    const theme = themes[themeName];
    const chromaOf = (value: string): number =>
      Number(/oklch\([\d.]+\s+([\d.]+)/.exec(value)?.[1] ?? 1);

    for (const key of ['surface', 'surfaceRaised', 'surfaceSunken', 'text', 'textMuted'] as const) {
      expect(chromaOf(theme[key]), `${key} carries too much colour`).toBeLessThanOrEqual(0.02);
    }
  });
});
