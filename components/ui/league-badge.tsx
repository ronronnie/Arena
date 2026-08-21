import type { Tier } from '@/lib/design/tokens';
import { cn } from '@/lib/ui/cn';

/**
 * LeagueBadge — which division a competitor is in.
 *
 * Core rule 5 is the reason this exists at all: there is no single global list, so
 * "where you stand" is always a tier plus a division, and both have to be legible at a
 * glance.
 *
 * Accessibility here is not colour-plus-nothing. Each tier has a distinct SHAPE as well
 * as a distinct colour — one chevron for bronze up to four for elite — so the badge
 * survives greyscale, low vision, and every form of colour blindness. The tier name is
 * always spelled out too.
 */
const tierChevrons: Record<Tier, number> = { bronze: 1, silver: 2, gold: 3, elite: 4 };

const tierText: Record<Tier, string> = {
  bronze: 'text-tier-bronze',
  silver: 'text-tier-silver',
  gold: 'text-tier-gold',
  elite: 'text-tier-elite',
};

export type LeagueBadgeProps = {
  tier: Tier;
  /** e.g. "Division 2". Omitted on a compact badge. */
  divisionName?: string;
  size?: 'sm' | 'md';
  className?: string;
};

export function LeagueBadge({ tier, divisionName, size = 'md', className }: LeagueBadgeProps) {
  const chevrons = tierChevrons[tier];

  return (
    <span
      className={cn(
        'border-line bg-surface-sunken inline-flex items-center gap-2 rounded-full border',
        size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5',
        className,
      )}
    >
      <span aria-hidden="true" className={cn('flex items-center', tierText[tier])}>
        {Array.from({ length: chevrons }, (_, i) => (
          <svg
            key={i}
            viewBox="0 0 24 24"
            className={cn(size === 'sm' ? 'size-3' : 'size-3.5', i > 0 && '-ml-1.5')}
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 15l6-6 6 6" />
          </svg>
        ))}
      </span>

      <span className={cn('arena-label text-text', size === 'sm' && 'text-2xs')}>
        {tier}
        {divisionName !== undefined && (
          <span className="text-text-muted font-medium normal-case"> · {divisionName}</span>
        )}
      </span>
    </span>
  );
}
