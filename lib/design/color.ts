/**
 * Colour maths — OKLCH to sRGB, and WCAG contrast.
 *
 * This exists so that "AA contrast" can be a TEST rather than an intention. Every colour
 * in `tokens.ts` is authored in OKLCH because it keeps lightness perceptually even across
 * hues, which is what makes per-category accent ramps swappable without one category
 * looking washed out. But WCAG 2.1 is defined on sRGB, so something has to convert, and
 * a designer eyeballing a contrast checker once is not a guarantee that survives a
 * palette change.
 *
 * Framework-free: no React, no Next, no DOM. It runs in a unit test.
 *
 * Conversion follows Björn Ottosson's OKLab reference implementation, then gamma-encodes
 * and clamps to 8-bit sRGB before measuring — because a browser will clip an out-of-gamut
 * colour too, and we want to measure the colour the user actually sees rather than the
 * one we asked for.
 */

export type Rgb = { r: number; g: number; b: number };

/** Parses `oklch(L C H)` / `oklch(L C H / A)`. L may be a percentage. */
export function parseOklch(value: string): { l: number; c: number; h: number; alpha: number } {
  const match = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i.exec(
    value.trim(),
  );
  if (!match) throw new Error(`Not an oklch() colour: ${value}`);

  const [, rawL, rawC, rawH, rawAlpha] = match;
  if (rawL === undefined || rawC === undefined || rawH === undefined) {
    throw new Error(`Malformed oklch() colour: ${value}`);
  }

  return {
    l: rawL.endsWith('%') ? Number(rawL.slice(0, -1)) / 100 : Number(rawL),
    c: Number(rawC),
    h: Number(rawH),
    alpha:
      rawAlpha === undefined
        ? 1
        : rawAlpha.endsWith('%')
          ? Number(rawAlpha.slice(0, -1)) / 100
          : Number(rawAlpha),
  };
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Linear-light sRGB channel to gamma-encoded sRGB. */
function encodeGamma(channel: number): number {
  const c = clamp01(channel);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Gamma-encoded sRGB channel (0-1) back to linear light. The WCAG definition. */
function decodeGamma(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** OKLCH to 8-bit sRGB, clamped to gamut the way a browser would clamp it. */
export function oklchToRgb(value: string): Rgb {
  const { l, c, h } = parseOklch(value);

  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const bb = c * Math.sin(hRad);

  const lCube = (l + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const sCube = (l - 0.0894841775 * a - 1.291485548 * bb) ** 3;

  const linearR = 4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube;
  const linearG = -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube;
  const linearB = -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube;

  return {
    r: Math.round(encodeGamma(linearR) * 255),
    g: Math.round(encodeGamma(linearG) * 255),
    b: Math.round(encodeGamma(linearB) * 255),
  };
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const r = decodeGamma(rgb.r / 255);
  const g = decodeGamma(rgb.g / 255);
  const b = decodeGamma(rgb.b / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1 to 21. Order of arguments does not matter. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(oklchToRgb(foreground));
  const b = relativeLuminance(oklchToRgb(background));
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG 2.1 AA thresholds.
 *
 * `largeText` is 18.66px bold or 24px regular and up. Arena's numbers are typographically
 * large by design — see the "numbers are typographic events" principle — but the 4.5
 * threshold is what we hold body text and every UI label to.
 */
export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
/** Icons, focus rings, input borders — anything that carries meaning without being text. */
export const AA_NON_TEXT = 3;

export function meetsAa(
  foreground: string,
  background: string,
  threshold: number = AA_NORMAL_TEXT,
): boolean {
  return contrastRatio(foreground, background) >= threshold;
}
