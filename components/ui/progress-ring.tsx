import { cn } from '@/lib/ui/cn';

/**
 * ProgressRing — progress made physical, in the Apple Fitness sense.
 *
 * Its main job in Arena is the compete-unlock: Core rule 4 says competing is EARNED after
 * `UNLOCK_THRESHOLD` judged comparisons, and a ring is the clearest way to show a bounded
 * thing filling up. It is not a streak and it does not nag — the ring simply states where
 * you are.
 *
 * The centre carries the count in text, so nobody has to estimate an arc. Accessible as a
 * progressbar with a spoken value, not as a decorative graphic.
 */
export type ProgressRingProps = {
  value: number;
  max: number;
  /** What is being counted, e.g. "comparisons judged". Used in the spoken label. */
  label: string;
  size?: number;
  className?: string;
  /** Rendered under the fraction. Keep it to two or three words. */
  caption?: string;
};

export function ProgressRing({
  value,
  max,
  label,
  size = 96,
  caption,
  className,
}: ProgressRingProps) {
  const safeMax = Math.max(1, max);
  const clamped = Math.min(safeMax, Math.max(0, value));
  const fraction = clamped / safeMax;

  const strokeWidth = Math.max(6, Math.round(size * 0.09));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const complete = clamped >= safeMax;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clamped}
      aria-valuetext={`${clamped} of ${safeMax} ${label}`}
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-surface-sunken"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className={cn(
            'origin-center -rotate-90',
            complete ? 'stroke-positive' : 'stroke-accent-base',
            'ease-standard transition-[stroke-dashoffset] duration-[var(--arena-duration-stage)]',
          )}
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="arena-numeric font-display text-lg leading-tight font-semibold">
            {clamped}
            <span className="text-text-subtle">/{safeMax}</span>
          </div>
          {caption !== undefined && (
            <div className="text-text-muted text-2xs mt-0.5">{caption}</div>
          )}
        </div>
      </div>
    </div>
  );
}
