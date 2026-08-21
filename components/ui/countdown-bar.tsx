import { cn } from '@/lib/ui/cn';

/**
 * CountdownBar — how much of a drop window is left.
 *
 * The whole product is built around a weekly ritual, so "when does this close" is the
 * single most repeated question in the app. It is answered in WORDS first and by a bar
 * second: "Closes Sunday · 4 days left" reads the same at fifteen and at sixty, and it
 * still works when the bar is invisible to someone.
 *
 * Deliberately undramatic. Core rule 8 forbids manufactured urgency, so this does not
 * pulse, flash, turn red at the end, or count individual seconds. It goes to `caution`
 * inside the final day because that is genuinely useful information, and stops there.
 */
export type CountdownBarProps = {
  /** 0 to 1 — how much of the window has elapsed. */
  elapsed: number;
  /** Plain-language remaining time, e.g. "4 days left". Never a ticking clock. */
  remainingLabel: string;
  /** When it closes, e.g. "Closes Sunday". */
  closesLabel: string;
  /** Inside the final day. Shifts the fill to `caution` and says so in words. */
  urgent?: boolean;
  className?: string;
};

export function CountdownBar({
  elapsed,
  remainingLabel,
  closesLabel,
  urgent = false,
  className,
}: CountdownBarProps) {
  const progress = Math.min(1, Math.max(0, elapsed));
  const percent = Math.round(progress * 100);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-text-muted text-sm">{closesLabel}</span>
        <span
          className={cn(
            'arena-numeric text-sm font-semibold',
            urgent ? 'text-caution' : 'text-text',
          )}
        >
          {remainingLabel}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${remainingLabel}. ${closesLabel}.`}
        className="bg-surface-sunken border-line h-1.5 w-full overflow-hidden rounded-full border"
      >
        <div
          className={cn(
            'h-full rounded-full',
            'ease-standard transition-[width] duration-[var(--arena-duration-base)]',
            urgent ? 'bg-caution' : 'bg-accent-base',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
