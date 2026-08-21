'use client';

import { Toaster as Sonner, toast as sonnerToast } from 'sonner';
import { durations } from '@/lib/design/tokens';

/**
 * Toast — a brief confirmation that something happened.
 *
 * Scoped tightly on purpose. Core rule 8 rules out red-dot spam and nagging, so a toast
 * in Arena confirms an action the user just took ("Vote recorded", "Entry withdrawn") and
 * is never used to pull someone back into the app, announce someone else's activity, or
 * tell a competitor their rank is slipping.
 *
 * Sonner handles the queue, the swipe-to-dismiss and the ARIA live region. The styling is
 * bound to Arena tokens rather than Sonner's defaults, and it is bottom-anchored for the
 * same reason sheets are: that is where the thumb already is.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      duration={durations.stage * 8}
      // Colour is never the only signal, so the variants differ by icon and wording too.
      icons={{
        success: <Glyph path="M20 6L9 17l-5-5" />,
        error: <Glyph path="M12 8v5M12 16.5v.5" />,
        info: <Glyph path="M12 16v-5M12 8.5v.5" />,
      }}
      toastOptions={{
        classNames: {
          toast: [
            'bg-surface-raised text-text border-line',
            'rounded-lg border shadow-[var(--arena-shadow-lg)]',
            'flex items-center gap-3 p-4 text-base',
          ].join(' '),
          description: 'text-text-muted text-sm',
          actionButton: 'text-accent-text font-medium',
          cancelButton: 'text-text-muted',
          success: 'text-positive',
          error: 'text-negative',
        },
      }}
    />
  );
}

function Glyph({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export { sonnerToast as toast };
