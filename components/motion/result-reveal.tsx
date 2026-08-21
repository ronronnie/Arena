'use client';

import { useEffect, useState } from 'react';
import { LeagueBadge } from '@/components/ui/league-badge';
import { StatDelta } from '@/components/ui/stat-delta';
import type { Tier } from '@/lib/design/tokens';
import { durations } from '@/lib/design/tokens';
import { cn } from '@/lib/ui/cn';
import { useReducedMotion } from './use-reduced-motion';

/**
 * ResultReveal — the season result card. Signature moment #4.
 *
 * A staged reveal: position, then the change, then the badge. The staging is the point —
 * delivered all at once it is a data readout, delivered in beats it is a result being
 * announced, and a season ending is the one moment in Arena that has earned ceremony.
 * (Core rule 8: ceremony should be rare. Three beats a season, not three a session.)
 *
 * The outcome is stated in WORDS — "Promoted", "Held", "Relegated" — never by colour or
 * by badge alone, and the vocabulary is deliberately sporting rather than punishing.
 * Relegation is a division change, not a verdict on a person, and the copy-rules test
 * keeps "lost" and "failed" out of this surface entirely.
 *
 * **Reduced motion:** every stage renders at once, fully. The information was never in
 * the timing.
 */
export type ResultRevealProps = {
  position: number;
  divisionSize: number;
  ratingDelta: number;
  tier: Tier;
  divisionName: string;
  outcome: 'promoted' | 'held' | 'relegated';
  className?: string;
};

const outcomeCopy: Record<ResultRevealProps['outcome'], string> = {
  promoted: 'Promoted',
  held: 'Division held',
  relegated: 'Moved down a division',
};

export function ResultReveal({
  position,
  divisionSize,
  ratingDelta,
  tier,
  divisionName,
  outcome,
  className,
}: ResultRevealProps) {
  const reducedMotion = useReducedMotion();
  // 0 = nothing, 1 = position, 2 = delta, 3 = badge and outcome.
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;

    const timers = [1, 2, 3].map((step) =>
      window.setTimeout(() => setStage(step), durations.stage * step),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [reducedMotion]);

  // Derived, so reduced motion shows the finished card rather than racing the timers.
  const visibleStage = reducedMotion ? 3 : stage;

  const staged = (atLeast: number): string =>
    cn(
      'transition-[opacity,transform] ease-entrance duration-[var(--arena-duration-stage)]',
      visibleStage >= atLeast ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
    );

  return (
    <div
      className={cn(
        'bg-surface-raised border-line flex flex-col items-center gap-4 rounded-xl border p-8 text-center',
        'shadow-[var(--arena-shadow-md)]',
        className,
      )}
    >
      <span className="arena-label">Season result</span>

      {/*
       * One live region for the whole card. Announcing each stage separately would read
       * the result out in three interruptions, which is the opposite of ceremony.
       */}
      <div aria-live="polite" className="flex flex-col items-center gap-4">
        <div className={staged(1)}>
          <div className="arena-numeric font-display text-hero leading-tight font-bold tracking-tighter">
            {position}
            <span className="text-text-subtle text-3xl">/{divisionSize}</span>
          </div>
          <div className="text-text-muted text-sm">Final position</div>
        </div>

        <div className={staged(2)}>
          <StatDelta value={ratingDelta} unit="rating" />
        </div>

        <div className={cn('flex flex-col items-center gap-2', staged(3))}>
          <LeagueBadge tier={tier} divisionName={divisionName} />
          <p className="font-display text-xl font-semibold tracking-tight">
            {outcomeCopy[outcome]}
          </p>
        </div>
      </div>
    </div>
  );
}
