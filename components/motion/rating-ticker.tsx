'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/ui/cn';
import { StatDelta } from '@/components/ui/stat-delta';
import { useReducedMotion } from './use-reduced-motion';

/**
 * RatingTicker — the rating tick. Signature moment #3.
 *
 * A true odometer: each digit is a column of 0-9 that rolls to its new position, with a
 * small stagger so the units digit lands first and the hundreds last, and a spring easing
 * that overshoots and settles. That physical settle is the whole point — it makes a
 * number feel like it moved rather than like it was replaced.
 *
 * Two rules meet here. **Core rule 2:** this number came from head-to-head comparisons and
 * nothing else. **Core rule 6:** it is tappable, and tapping it opens the plain-language
 * explanation — which is why `onExplain` is required rather than optional.
 *
 * **Reduced motion:** the digits are simply there, at their final value, with the delta
 * beside them. Nothing is lost: the change was always stated in text by `StatDelta`, and
 * the roll was decoration on top of it.
 */
export type RatingTickerProps = {
  from: number;
  to: number;
  /** Opens the explanation. Core rule 6 — every number is explainable. */
  onExplain: () => void;
  className?: string;
};

export function RatingTicker({ from, to, onExplain, className }: RatingTickerProps) {
  const reducedMotion = useReducedMotion();
  const [rolled, setRolled] = useState(false);

  useEffect(() => {
    // One frame at the starting value, so the columns have somewhere to roll FROM.
    const timer = window.setTimeout(() => setRolled(true), 60);
    return () => window.clearTimeout(timer);
  }, [to]);

  // Derived rather than stored: under reduced motion there is no roll to wait for.
  const displayed = reducedMotion || rolled ? to : from;
  const width = Math.max(String(Math.round(from)).length, String(Math.round(to)).length);
  const digits = String(Math.round(displayed)).padStart(width, '0').split('');
  const delta = Math.round(to) - Math.round(from);

  return (
    <button
      type="button"
      onClick={onExplain}
      aria-label={`Rating ${Math.round(to)}, ${delta === 0 ? 'unchanged' : delta > 0 ? `up ${delta}` : `down ${Math.abs(delta)}`}. Tap for an explanation.`}
      className={cn(
        'inline-flex min-h-[var(--arena-touch-target)] items-center gap-3 rounded-md px-2',
        'hover:bg-surface-sunken transition-colors duration-[var(--arena-duration-fast)]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="arena-numeric font-display text-display flex leading-tight font-semibold"
      >
        {digits.map((digit, index) => (
          <DigitColumn
            key={`${index}-${width}`}
            digit={Number(digit)}
            // Units first, then tens, then hundreds — the way a mechanical counter falls.
            delayMs={reducedMotion ? 0 : (digits.length - 1 - index) * 45}
            animated={!reducedMotion}
          />
        ))}
      </span>

      <StatDelta value={delta} unit="rating" compact />
    </button>
  );
}

/** One rolling column. The strip holds 0-9 and slides to put `digit` in the window. */
function DigitColumn({
  digit,
  delayMs,
  animated,
}: {
  digit: number;
  delayMs: number;
  animated: boolean;
}) {
  return (
    <span className="inline-block h-[1em] overflow-hidden align-baseline tabular-nums">
      <span
        className={cn(
          'flex flex-col',
          animated && 'ease-spring transition-transform duration-[var(--arena-duration-stage)]',
        )}
        style={{
          transform: `translateY(-${digit}em)`,
          transitionDelay: animated ? `${delayMs}ms` : undefined,
        }}
      >
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="block h-[1em] leading-[1em]">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}
