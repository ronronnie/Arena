'use client';

import type * as React from 'react';
import { cn } from '@/lib/ui/cn';
import { useReducedMotion } from './use-reduced-motion';

/**
 * RevealCard — the blind reveal. Signature moment #1.
 *
 * This is where the user FEELS the fairness of the whole system: two unnamed clips, you
 * choose on the performance alone, and only then does the card turn over and tell you who
 * it was. Core rule 3 calls the reveal a state change rather than a rendering decision,
 * and this component is the visible half of that — the data half is `revealComparison`,
 * which refuses to return a name until a vote exists.
 *
 * So the flip is given weight: 380ms on a spring that overshoots slightly and comes back,
 * which is long for UI motion and deliberately so. It is the one animation in Arena
 * permitted to take its time, because it is the ceremony the product is built around.
 *
 * **Reduced motion:** no rotation. The face swaps directly and the reveal still happens —
 * the identity was never carried BY the animation, only accompanied by it.
 */
export type RevealCardProps = {
  /** Drives the flip. Flipping this is the state change. */
  revealed: boolean;
  /** The blind face: a marker and a video. Never an identity. */
  front: React.ReactNode;
  /** The revealed face: who it was. */
  back: React.ReactNode;
  className?: string;
};

export function RevealCard({ revealed, front, back, className }: RevealCardProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    // Same information, no rotation. Not a lesser experience — a different one.
    return (
      <div className={cn('relative', className)} data-revealed={revealed}>
        <div data-slot={revealed ? 'reveal-back' : 'reveal-front'}>{revealed ? back : front}</div>
      </div>
    );
  }

  return (
    <div className={cn('relative [perspective:1400px]', className)} data-revealed={revealed}>
      <div
        className={cn(
          'relative h-full w-full [transform-style:preserve-3d]',
          'ease-spring transition-transform',
          'duration-[var(--arena-duration-reveal)]',
          revealed && '[transform:rotateY(180deg)]',
        )}
      >
        {/*
         * Both faces stay mounted so the flip has something to reveal. `aria-hidden` and
         * `inert` follow the visible face, so a screen reader and the tab order only ever
         * meet one of them — otherwise the identity would be readable, by keyboard, before
         * the vote. That would break Core rule 3 through the back door.
         */}
        <div
          data-slot="reveal-front"
          className="[backface-visibility:hidden]"
          aria-hidden={revealed}
          inert={revealed}
        >
          {front}
        </div>

        <div
          data-slot="reveal-back"
          className="absolute inset-0 [transform:rotateY(180deg)] [backface-visibility:hidden]"
          aria-hidden={!revealed}
          inert={!revealed}
        >
          {back}
        </div>
      </div>
    </div>
  );
}
