'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/ui/cn';

/**
 * Button.
 *
 * Two things here are not negotiable and are tested rather than trusted:
 *
 * 1. **The 48px floor.** Every size reaches `--arena-touch-target` in height. The `sm`
 *    size looks smaller but keeps a full-size hit area through a padded pseudo-element —
 *    a visually compact control in a dense scoreboard row still has to be pressable by
 *    someone whose hands are not steady.
 * 2. **Never colour as the sole signal.** `destructive` differs from `primary` by more
 *    than hue; callers must still say what the button does in words.
 *
 * The palette comes entirely from the accent ramp, so a button inside a
 * `data-category="bharatanatyam"` subtree is gold and the same button under
 * `metal-vocals` is violet, with no component-level branching.
 */
const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md font-medium select-none',
    'transition-[background-color,color,border-color,opacity] duration-[var(--arena-duration-fast)] ease-standard',
    'disabled:pointer-events-none disabled:opacity-45',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        /** The one action a screen wants you to take. At most one per view. */
        primary: 'bg-accent-base text-on-accent hover:bg-accent-strong',
        /** Everything else. */
        secondary: 'bg-surface-sunken text-text hover:bg-accent-soft',
        outline: 'border border-line-strong bg-transparent text-text hover:bg-surface-sunken',
        ghost: 'bg-transparent text-text-muted hover:bg-surface-sunken hover:text-text',
        /** Withdraw an entry, delete an account. Rare, and always confirmed. */
        destructive: 'border border-negative bg-transparent text-negative hover:bg-negative/10',
      },
      size: {
        /*
         * `sm` is visually compact but keeps the full touch target via the ::after
         * overlay below — see the note at the top of this file.
         */
        sm: [
          'h-9 px-3 text-sm',
          "after:absolute after:inset-x-0 after:top-1/2 after:h-[var(--arena-touch-target)] after:-translate-y-1/2 after:content-['']",
        ],
        md: 'min-h-[var(--arena-touch-target)] px-4 text-base',
        lg: 'min-h-[calc(var(--arena-touch-target)+8px)] px-6 text-lg',
        /** Square, for a single icon. Still 48px. */
        icon: 'size-[var(--arena-touch-target)]',
      },
      /*
       * A full-width button must be allowed to wrap. `whitespace-nowrap` is right for a
       * button sized to its content — it stops "Enter this brief" breaking after "Enter"
       * in a row of controls — but on a block button at 200% type it forces the label
       * past the viewport and scrolls the whole page sideways.
       */
      block: { true: 'w-full whitespace-normal', false: '' },
    },
    defaultVariants: { variant: 'secondary', size: 'md', block: false },
  },
);

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render as the child element (a link, usually) while keeping the styling. */
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';

  return (
    <Component
      data-slot="button"
      // A <button> inside a form defaults to type="submit", which surprises people.
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
