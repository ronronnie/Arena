import { cn } from '@/lib/ui/cn';

/**
 * StatDelta — how much a number moved.
 *
 * Three deliberate constraints:
 *
 * 1. **Never colour alone.** Every delta carries a sign, an arrow, and (unless compact) a
 *    word. Roughly one man in twelve cannot reliably separate the green from the red, and
 *    a rating change is not something to leave them guessing at.
 * 2. **No panic.** Core rule 8 rules out "your rank is dropping!" theatrics, so a
 *    negative delta is warm rather than alarm-red, and the wording is "down 8", never
 *    "lost 8". The copy-rules test enforces that the banned vocabulary stays out.
 * 3. **No movement is a state**, not an absence. "Unchanged" is rendered, because a blank
 *    space makes a user wonder whether the screen is broken.
 */
export type StatDeltaProps = {
  value: number;
  /** What moved — "rating", "position". Used in the accessible label. */
  unit?: string;
  /** Hides the word, keeping sign and arrow. For dense scoreboard rows. */
  compact?: boolean;
  className?: string;
};

export function StatDelta({ value, unit = '', compact = false, className }: StatDeltaProps) {
  const rounded = Math.round(value);
  const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'level';

  const tone = {
    up: 'text-positive',
    down: 'text-negative',
    level: 'text-text-muted',
  }[direction];

  const word = { up: 'Up', down: 'Down', level: 'Unchanged' }[direction];
  const suffix = unit === '' ? '' : ` ${unit}`;
  const label =
    direction === 'level' ? `Unchanged${suffix}` : `${word} ${Math.abs(rounded)}${suffix}`;

  return (
    <span className={cn('inline-flex items-center gap-1', tone, className)} aria-label={label}>
      <span aria-hidden="true">
        {direction === 'level' ? (
          <svg
            viewBox="0 0 24 24"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
          >
            <path d="M5 12h14" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className={cn('size-3.5', direction === 'down' && 'rotate-180')}
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        )}
      </span>

      <span aria-hidden="true" className="arena-numeric text-sm font-semibold">
        {direction === 'level' ? '0' : `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}`}
      </span>

      {!compact && (
        <span aria-hidden="true" className="text-sm font-medium">
          {word}
        </span>
      )}
    </span>
  );
}
