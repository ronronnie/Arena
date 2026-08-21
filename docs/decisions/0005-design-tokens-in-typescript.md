# 0005 — Design tokens in TypeScript, CSS generated from them

- **Status:** Accepted
- **Date:** 2026-08-22
- **Context:** Prompt 2

## Context

Tailwind v4 is CSS-first: the idiomatic place for design tokens is an `@theme` block in a
stylesheet. The prompt pack asks for `/lib/design/tokens.ts` — tokens in TypeScript.

Those are two sources of truth for the same palette, and picking either one naively costs
something real:

- **CSS only.** Nothing can unit-test it. "WCAG AA contrast enforced by a token-level
  test" — an explicit deliverable, and the thing that makes Arena usable by a
  sixty-year-old vocal coach and a fifteen-year-old on the same screen — is not
  expressible against a stylesheet without parsing it.
- **TypeScript only.** Every colour would have to reach CSS through a React style prop or
  a build-time plugin, which loses Tailwind's utilities and puts a JavaScript dependency
  in front of the first paint.
- **Both, maintained by hand.** The classic failure: the TypeScript says one thing, the
  stylesheet says another, and the component library follows whichever it imported.

## Decision

**`lib/design/tokens.ts` is the source of truth. `app/tokens.css` is generated from it.**

- `lib/design/css.ts` renders the tokens to CSS custom properties.
- `scripts/build-tokens.ts` writes `app/tokens.css` (`npm run design:tokens`).
- `app/globals.css` imports it and maps the variables onto Tailwind's `@theme`, so
  `bg-surface` and `text-text-muted` are ordinary utilities.
- **`tests/unit/tokens-sync.test.ts` regenerates the CSS and compares.** Editing a token
  without regenerating fails `npm run check`. That test is what makes this a generated
  artefact rather than a second copy.

Colours are authored in **OKLCH**, and `lib/design/color.ts` implements OKLCH → sRGB and
WCAG contrast so `tests/unit/tokens-contrast.test.ts` can hold all 79 foreground /
background pairings to AA — including every per-category accent ramp in both themes, and
the hover states, which is where these usually slip.

## Consequences

**Good**

- Contrast is a property of the palette, checked on every run, rather than a fact about
  the afternoon someone opened a contrast checker.
- Per-category ramps are data. Adding a discipline is one object in `categoryAccents`, and
  the contrast suite covers it automatically — including a check that its hue is more than
  30° from every existing category, so two disciplines cannot quietly converge.
- Tailwind utilities still work, and the first paint has no JavaScript dependency.

**Costs — stated plainly**

- A generated file in the repository, and a build step to forget. The sync test is the
  mitigation, and it is the only thing making this safe.
- Two files to read before changing a colour, not one.
- The generator is bespoke. It is about 150 lines and has no tests of its own beyond the
  sync test and the CSS it produces.

**Revisit if**

- Tailwind v4 gains a supported way to derive `@theme` from a TypeScript module, which
  would make the generator redundant.

## The type scale, and a bug worth recording

The scale is expressed as multipliers of a single `--arena-font-root`, so 200% dynamic
type is one custom property rather than a redesign.

The first implementation declared the steps only on `:root`:

```css
:root {
  --arena-font-root: 1rem;
  --arena-text-base: calc(var(--arena-font-root) * 1);
}
```

…and `/design-system` overrode `--arena-font-root` on a wrapper. **It did nothing.** A
custom property that references another is resolved in the scope where it is _declared_,
so `--arena-text-base` had already been computed against the root's value; descendants
inherit the computed result, not the formula.

The generator now emits the steps for `:root` **and** `[data-arena-type-scope]`, so any
subtree can re-derive the whole scale from its own root size.

This is recorded because nothing about it is visible from the outside: the page renders,
the CSS is valid, no tool warns. What caught it was comparing screenshot heights across
the three scales and finding all three identical at 5771px. If a future change makes the
scale look inert again, check where the steps are declared before checking anything else.
