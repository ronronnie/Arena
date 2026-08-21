import type * as React from 'react';
import { cn } from '@/lib/ui/cn';

/**
 * EmptyState.
 *
 * Empty is usually a good state in Arena, and the copy has to reflect that. "You have
 * judged everything on this brief" is a finished session, not a failure — Core rule 8
 * wants bounded, purposeful sessions, so running out of things to do is the design
 * working. Nothing here apologises, and the copy-rules test keeps the words "lost",
 * "failed" and "worst" out of the whole surface.
 *
 * Typography-led rather than illustration-led: no character, no mascot, no sad cloud.
 * Illustration styles age-code hard, and this component would be the first place that
 * showed.
 */
export type EmptyStateProps = {
  title: string;
  description: string;
  /** A single next step, when there genuinely is one. Empty is allowed to be terminal. */
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border-line bg-surface-sunken flex flex-col items-center gap-3 rounded-lg border border-dashed',
        'px-6 py-10 text-center',
        className,
      )}
    >
      <h3 className="font-display text-lg leading-snug font-semibold tracking-tight">{title}</h3>
      <p className="text-text-muted max-w-sm text-base leading-normal text-balance">
        {description}
      </p>
      {action !== undefined && <div className="mt-1">{action}</div>}
    </div>
  );
}
