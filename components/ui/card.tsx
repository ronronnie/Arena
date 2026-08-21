import type * as React from 'react';
import { cn } from '@/lib/ui/cn';

/**
 * Card — the standard container.
 *
 * Whitespace as confidence: the padding here is more generous than a feed would use,
 * because dense screens read as cheap and sparseness is what signals that a ranking means
 * something. Elevation is almost flat; scoreboards do not have drop shadows.
 */
export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'bg-surface-raised border-line rounded-lg border shadow-sm',
        'flex flex-col gap-4 p-5',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-header" className={cn('flex flex-col gap-1', className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      data-slot="card-title"
      className={cn('font-display text-lg leading-snug font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-text-muted text-sm', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-content" className={cn('flex flex-col gap-3', className)} {...props} />
  );
}

export function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-footer" className={cn('flex items-center gap-3', className)} {...props} />
  );
}

/** The small-caps scoreboard heading used above a section. */
export function SectionLabel({ className, ...props }: React.ComponentProps<'h2'>) {
  return <h2 className={cn('arena-label', className)} {...props} />;
}
