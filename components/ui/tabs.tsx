'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type * as React from 'react';
import { cn } from '@/lib/ui/cn';

/**
 * Tabs.
 *
 * The first place these appear in the product is the lane switch — Set Piece and
 * Signature — and that makes them load-bearing for Core rule 1. The two lanes are
 * separate tables, separate queries and separate mental models; the UI should make that
 * separation feel deliberate rather than incidental, which is what a tab does and what a
 * blended feed would not.
 *
 * Radix supplies roving tabindex and arrow-key navigation. The selected tab is marked by
 * a weight change and an underline as well as colour.
 */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('border-line flex w-full items-stretch gap-1 border-b', className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'min-h-[var(--arena-touch-target)] flex-1 px-3 pb-2 text-base',
        'text-text-muted font-medium',
        '-mb-px border-b-2 border-transparent',
        'ease-standard transition-[color,border-color] duration-[var(--arena-duration-fast)]',
        // Selected state: colour, weight AND an underline. Never colour alone.
        'data-[state=active]:border-accent-base data-[state=active]:text-text data-[state=active]:font-semibold',
        'disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-4', className)} {...props} />;
}
