/**
 * ARENA DESIGN TOKENS — the single source of truth.
 *
 * The thesis is BROADCAST, NOT FEED. The reference set is F1 timing graphics, Olympic
 * scoreboards, Chess.com and Apple Fitness rings — not Instagram. That is not a mood
 * board; it drives concrete decisions you can read off this file:
 *
 *   - **Video is the colour.** The chrome is near-monochrome (chroma <= 0.02 on every
 *     surface and text token). Performances supply the energy, and a loud UI would also
 *     amplify inconsistent user footage.
 *   - **Numbers are typographic events.** The scale runs further at the top end than a UI
 *     scale needs to, because a rating is the product's identity object.
 *   - **Whitespace as confidence.** Dense reads as cheap.
 *   - **Category theming.** A bharatanatyam competitor and a metal vocalist should not
 *     feel like they are in the same app. One accent ramp each, swapped at the root via
 *     `data-category`.
 *
 * Nothing else in the codebase may hardcode a colour, a radius, a duration, or a font
 * size. `app/tokens.css` is GENERATED from this file by `npm run design:tokens`, and
 * `tests/unit/tokens-sync.test.ts` fails if the two drift apart.
 *
 * Framework-free: this is data, and it must stay importable from a test with no DOM.
 *
 * Colours are OKLCH so that lightness is perceptually even across hues — which is what
 * lets a gold ramp and a violet ramp swap in at the same lightness without one of them
 * looking washed out. Contrast is enforced by `tests/unit/tokens-contrast.test.ts`.
 */

/* ------------------------------------------------------------------------------------
 * Semantic colour
 * ---------------------------------------------------------------------------------- */

export type ThemeColors = {
  /** The page. */
  surface: string;
  /** Cards and raised panels. */
  surfaceRaised: string;
  /** Wells, inset areas, video letterboxing. */
  surfaceSunken: string;
  /** Scrims behind sheets and dialogs. */
  overlay: string;

  /** Primary reading colour. */
  text: string;
  /** Secondary — labels, metadata. Still held to 4.5:1. */
  textMuted: string;
  /** Tertiary — the quietest text we permit. Still held to 4.5:1. */
  textSubtle: string;
  /** Text on a filled dark control. */
  textInverse: string;

  /** Decorative dividers. Not required to carry meaning, so not held to 3:1. */
  border: string;
  /** Interactive boundaries — inputs, outlined buttons. Held to 3:1. */
  borderStrong: string;
  /** Focus indication. Held to 3:1 against both surfaces it can sit on. */
  focus: string;

  /** A rating went up, an entry passed. Never the sole signal — see StatDelta. */
  positive: string;
  /** A rating went down. Deliberately warm rather than alarm-red: Core rule 8 forbids */
  /** "your rank is dropping!" panic, and the palette should not supply it either. */
  negative: string;
  /** Deadlines and windows closing. */
  caution: string;
};

const light: ThemeColors = {
  surface: 'oklch(0.988 0.002 255)',
  surfaceRaised: 'oklch(1 0 0)',
  surfaceSunken: 'oklch(0.958 0.004 255)',
  overlay: 'oklch(0.19 0.012 255 / 0.55)',

  text: 'oklch(0.19 0.012 255)',
  textMuted: 'oklch(0.46 0.012 255)',
  textSubtle: 'oklch(0.53 0.012 255)',
  textInverse: 'oklch(0.99 0.002 255)',

  border: 'oklch(0.9 0.005 255)',
  borderStrong: 'oklch(0.62 0.01 255)',
  focus: 'oklch(0.55 0.13 255)',

  positive: 'oklch(0.5 0.11 156)',
  negative: 'oklch(0.53 0.13 32)',
  caution: 'oklch(0.52 0.11 72)',
};

const dark: ThemeColors = {
  surface: 'oklch(0.17 0.012 255)',
  surfaceRaised: 'oklch(0.22 0.014 255)',
  surfaceSunken: 'oklch(0.13 0.01 255)',
  overlay: 'oklch(0.09 0.01 255 / 0.68)',

  text: 'oklch(0.97 0.003 255)',
  textMuted: 'oklch(0.79 0.012 255)',
  textSubtle: 'oklch(0.72 0.012 255)',
  textInverse: 'oklch(0.17 0.012 255)',

  border: 'oklch(0.3 0.014 255)',
  borderStrong: 'oklch(0.56 0.016 255)',
  focus: 'oklch(0.78 0.12 255)',

  positive: 'oklch(0.8 0.13 156)',
  negative: 'oklch(0.78 0.12 32)',
  caution: 'oklch(0.82 0.12 82)',
};

export const themes = { light, dark } as const;
export type ThemeName = keyof typeof themes;

/* ------------------------------------------------------------------------------------
 * Per-category accent ramps
 * ---------------------------------------------------------------------------------- */

export type AccentRamp = {
  /** Tinted background for chips and selected rows. */
  soft: string;
  /** The accent used as TEXT on `surface`. Held to 4.5:1. */
  text: string;
  /** Filled controls. `onAccent` must reach 4.5:1 against this. */
  base: string;
  /** Hover and pressed states of a filled control. */
  strong: string;
  /** Text and icons sitting on `base`. */
  onAccent: string;
};

type CategoryRamp = { light: AccentRamp; dark: AccentRamp };

/**
 * Accent ramps, keyed by category slug. The slugs match `categories.slug` in the
 * database — `default` is the fallback for a page with no category in scope.
 *
 * Hues are chosen far apart so two competitors in different disciplines get a genuinely
 * different room, and all of them sit at a low enough chroma to stay chrome rather than
 * become decoration. There is no neon here on purpose: it excludes anyone over thirty and
 * cheapens the credential.
 */
export const categoryAccents: Record<string, CategoryRamp> = {
  /** Broadcast blue. Neutral authority — the timing-graphic default. */
  default: {
    light: {
      soft: 'oklch(0.95 0.03 255)',
      text: 'oklch(0.48 0.14 255)',
      base: 'oklch(0.45 0.15 255)',
      strong: 'oklch(0.38 0.14 255)',
      onAccent: 'oklch(0.99 0.005 255)',
    },
    dark: {
      soft: 'oklch(0.28 0.05 255)',
      text: 'oklch(0.8 0.12 255)',
      base: 'oklch(0.72 0.14 255)',
      strong: 'oklch(0.8 0.13 255)',
      onAccent: 'oklch(0.17 0.02 255)',
    },
  },

  /** Temple gold. Warm, ceremonial, and old enough not to read as a teen app. */
  bharatanatyam: {
    light: {
      soft: 'oklch(0.95 0.045 75)',
      text: 'oklch(0.46 0.1 65)',
      base: 'oklch(0.44 0.1 65)',
      strong: 'oklch(0.37 0.09 65)',
      onAccent: 'oklch(0.99 0.01 75)',
    },
    dark: {
      soft: 'oklch(0.29 0.05 70)',
      text: 'oklch(0.83 0.12 78)',
      base: 'oklch(0.78 0.13 78)',
      strong: 'oklch(0.85 0.12 78)',
      onAccent: 'oklch(0.18 0.02 70)',
    },
  },

  /** Cold steel violet. Hard-edged without being a gamer neon. */
  'metal-vocals': {
    light: {
      soft: 'oklch(0.94 0.035 295)',
      text: 'oklch(0.47 0.16 295)',
      base: 'oklch(0.44 0.17 295)',
      strong: 'oklch(0.37 0.16 295)',
      onAccent: 'oklch(0.99 0.005 295)',
    },
    dark: {
      soft: 'oklch(0.28 0.06 295)',
      text: 'oklch(0.81 0.12 295)',
      base: 'oklch(0.74 0.14 295)',
      strong: 'oklch(0.81 0.13 295)',
      onAccent: 'oklch(0.17 0.02 295)',
    },
  },
};

/** Division tiers. Metallic rather than saturated — a badge, not a sticker. */
export const tierColors = {
  bronze: { light: 'oklch(0.48 0.08 55)', dark: 'oklch(0.78 0.09 62)' },
  silver: { light: 'oklch(0.5 0.012 255)', dark: 'oklch(0.82 0.012 255)' },
  gold: { light: 'oklch(0.48 0.1 85)', dark: 'oklch(0.84 0.12 90)' },
  elite: { light: 'oklch(0.45 0.14 300)', dark: 'oklch(0.8 0.13 300)' },
} as const;

export type Tier = keyof typeof tierColors;

/* ------------------------------------------------------------------------------------
 * Type
 * ---------------------------------------------------------------------------------- */

/**
 * The scale is expressed as MULTIPLIERS of `--arena-font-root`, not as fixed rem values.
 *
 * That indirection is what makes "dynamic type to 200% without layout breakage" a real,
 * testable property rather than a hope: `/design-system` renders the whole component set
 * at 100%, 150% and 200% by changing one custom property, and a user who raises their
 * browser's base font size gets exactly the same treatment for free.
 */
export const typeScale = {
  '2xs': 0.6875, // 11px — timing-graphic labels only
  xs: 0.75, // 12
  sm: 0.875, // 14
  base: 1, // 16
  lg: 1.125, // 18
  xl: 1.375, // 22
  '2xl': 1.75, // 28
  '3xl': 2.25, // 36
  display: 3, // 48 — a rating on a result card
  hero: 4.25, // 68 — season result only. Ceremony should be rare.
} as const;

export const lineHeights = {
  tight: 1.05, // display numerals
  snug: 1.25, // headings
  normal: 1.55, // body
} as const;

export const letterSpacing = {
  tighter: '-0.02em', // display numerals
  tight: '-0.01em',
  normal: '0em',
  wide: '0.06em', // uppercase labels
  widest: '0.14em', // the small-caps scoreboard labels
} as const;

export const fontWeights = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

/* ------------------------------------------------------------------------------------
 * Space, shape, depth
 * ---------------------------------------------------------------------------------- */

/** 4px base grid. Named by step so a component never writes `12px`. */
export const spacing = {
  '0': '0rem',
  px: '1px',
  '1': '0.25rem',
  '2': '0.5rem',
  '3': '0.75rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '8': '2rem',
  '10': '2.5rem',
  '12': '3rem',
  '16': '4rem',
  '20': '5rem',
} as const;

export const radii = {
  none: '0px',
  sm: '0.375rem',
  md: '0.625rem',
  lg: '0.875rem',
  xl: '1.25rem',
  full: '9999px',
} as const;

/**
 * Elevation is nearly flat on purpose. Scoreboards do not have drop shadows; depth here
 * separates layers rather than decorating them.
 */
export const elevation = {
  none: 'none',
  sm: '0 1px 2px oklch(0.19 0.012 255 / 0.06)',
  md: '0 2px 8px oklch(0.19 0.012 255 / 0.08)',
  lg: '0 8px 28px oklch(0.19 0.012 255 / 0.12)',
  /** Sheets and dialogs only. */
  overlay: '0 -8px 40px oklch(0.19 0.012 255 / 0.18)',
} as const;

/**
 * The minimum interactive size, in CSS pixels.
 *
 * This is accessibility as age-inclusivity rather than as compliance: it is what lets a
 * sixty-year-old vocal coach use the same voting screen as a fifteen-year-old. Every
 * interactive primitive in `components/ui` is tested against it.
 */
export const MIN_TOUCH_TARGET_PX = 48;

/* ------------------------------------------------------------------------------------
 * Motion
 * ---------------------------------------------------------------------------------- */

/**
 * Durations in milliseconds.
 *
 * `reveal` is 380ms because that is the blind reveal — the moment the user feels the
 * fairness of the whole system — and it is the one animation permitted to take its time.
 * Everything else is under a quarter of a second, because Core rule 8 wants bounded,
 * purposeful sessions and waiting for chrome is not purposeful.
 */
export const durations = {
  instant: 0,
  fast: 120,
  base: 200,
  /** The identity reveal card flip. */
  reveal: 380,
  /** One beat of the season-result choreography. */
  stage: 520,
} as const;

export const easings = {
  /** Default UI motion. */
  standard: 'cubic-bezier(0.2, 0, 0.1, 1)',
  /** Entering the screen. */
  entrance: 'cubic-bezier(0, 0, 0.2, 1)',
  /** Leaving it. */
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
  /** The odometer settle and the reveal flip — overshoots, then comes back. */
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

/* ------------------------------------------------------------------------------------
 * Everything, for the generator and for diagnostics
 * ---------------------------------------------------------------------------------- */

export const tokens = {
  themes,
  categoryAccents,
  tierColors,
  typeScale,
  lineHeights,
  letterSpacing,
  fontWeights,
  spacing,
  radii,
  elevation,
  durations,
  easings,
  MIN_TOUCH_TARGET_PX,
} as const;
