'use client';

import { cn } from '@/lib/ui/cn';

/**
 * RatingBadge — a Glicko-2 rating, shown the way Arena promises to show numbers.
 *
 * Two core rules meet in this component:
 *
 * **Core rule 6 — every number is explainable.** The badge is a BUTTON, always. Tapping it
 * is how a user gets the plain-language account of where the number came from. There is
 * no display-only variant, because a number you cannot interrogate is exactly what the
 * transparency rule exists to prevent.
 *
 * **Provisional ratings are shown as a range, not a false precision.** A rating with a
 * high deviation is a guess, and rendering it as "1500" claims a confidence we do not
 * have. Above `PROVISIONAL_RD_THRESHOLD` the badge renders "1440–1560" and says
 * "provisional" in words — never by colour alone.
 */
export type RatingBadgeProps = {
  rating: number;
  /** Glicko-2 rating deviation. Drives the provisional range. */
  ratingDeviation: number;
  isProvisional: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Opens the explanation. Required — see Core rule 6 above. */
  onExplain: () => void;
  className?: string;
};

const sizeClasses = {
  sm: 'text-base px-2.5',
  md: 'text-xl px-3',
  lg: 'text-3xl px-4',
} as const;

export function RatingBadge({
  rating,
  ratingDeviation,
  isProvisional,
  size = 'md',
  onExplain,
  className,
}: RatingBadgeProps) {
  const rounded = Math.round(rating);
  const spread = Math.round(ratingDeviation);
  const label = isProvisional
    ? `Provisional rating, between ${rounded - spread} and ${rounded + spread}. Tap for an explanation.`
    : `Rating ${rounded}. Tap for an explanation.`;

  return (
    <button
      type="button"
      onClick={onExplain}
      aria-label={label}
      className={cn(
        'group inline-flex min-h-[var(--arena-touch-target)] items-center gap-2 rounded-md',
        'bg-surface-sunken hover:bg-accent-soft border-line border py-1',
        'ease-standard transition-colors duration-[var(--arena-duration-fast)]',
        sizeClasses[size],
        className,
      )}
    >
      <span className="arena-numeric font-display leading-tight font-semibold">
        {isProvisional ? (
          <>
            {rounded - spread}
            <span aria-hidden="true" className="text-text-subtle mx-0.5">
              –
            </span>
            {rounded + spread}
          </>
        ) : (
          rounded
        )}
      </span>

      {isProvisional && (
        /* In words, not just in styling. Colour is never the only signal. */
        <span className="arena-label text-text-subtle">Provisional</span>
      )}

      <span
        aria-hidden="true"
        className={cn(
          'text-text-subtle group-hover:text-accent-text grid size-4 place-items-center',
          'border-line-strong rounded-full border text-[0.6em] leading-none font-semibold',
        )}
      >
        ?
      </span>
    </button>
  );
}
