'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import type * as React from 'react';
import { cn } from '@/lib/ui/cn';

/**
 * Sheet — bottom-anchored by default, because hands are.
 *
 * The design direction rules out dense desktop-first layouts: Arena is one-handed,
 * thumb-zone, bottom-anchored. A sheet rising from the bottom edge puts its controls
 * where a thumb already is, where a centred dialog puts them where a mouse would be.
 *
 * This is also the standard home for a Core rule 6 explanation. Tapping any number opens
 * one of these with the plain-language account of where it came from — which is why
 * transparency is an interaction pattern here rather than a policy page.
 *
 * Radix supplies the parts that are tedious and easy to get wrong: focus trapping, scroll
 * locking, Escape, and returning focus to whatever opened it.
 */
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

export function SheetContent({
  className,
  children,
  side = 'bottom',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: 'bottom' | 'right' }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 bg-[var(--arena-overlay)]',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
        )}
      />
      <SheetPrimitive.Content
        className={cn(
          'bg-surface-raised border-line fixed z-50 flex flex-col gap-4 shadow-[var(--arena-shadow-overlay)]',
          'ease-standard duration-[var(--arena-duration-base)]',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          side === 'bottom' && [
            'inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-xl border-t p-5',
            // Home indicator on iOS, and a thumb needs somewhere to rest.
            'pb-[max(1.25rem,env(safe-area-inset-bottom))]',
            'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
          ],
          side === 'right' && [
            'inset-y-0 right-0 w-full max-w-sm overflow-y-auto border-l p-5',
            'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
          ],
          className,
        )}
        {...props}
      >
        {side === 'bottom' && (
          /* The grab handle. Decorative — the sheet is dismissed by Escape, the close
             button, or tapping the overlay, none of which require a drag gesture. */
          <div
            aria-hidden="true"
            className="bg-line-strong mx-auto h-1 w-10 shrink-0 rounded-full"
          />
        )}
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 text-left', className)} {...props} />;
}

export function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      className={cn('font-display text-xl leading-snug font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      className={cn('text-text-muted text-base leading-normal', className)}
      {...props}
    />
  );
}

export function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mt-2 flex flex-col gap-2', className)} {...props} />;
}
