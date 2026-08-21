import type * as React from 'react';
import { cn } from '@/lib/ui/cn';
import { Card, CardDescription, CardHeader, CardTitle } from './card';
import { CountdownBar, type CountdownBarProps } from './countdown-bar';

/**
 * SetPieceCard — one weekly brief.
 *
 * The set piece is the ranked lane and the reason the product has a heartbeat, so this
 * card is the most repeated object in the app. It leads with the week number as a
 * timing-graphic label, then the task, then when it closes — the order a competitor
 * actually reads it in.
 *
 * The status is a WORD, always. "Open", "Judging", "Closed" — never a coloured dot on its
 * own, and never a red badge implying you have already failed at something.
 */
export type SetPieceStatusLabel = 'Open' | 'Judging' | 'Closed' | 'Opens soon';

export type SetPieceCardProps = {
  weekNo: number;
  title: string;
  briefText: string;
  status: SetPieceStatusLabel;
  countdown?: CountdownBarProps;
  /** Rendered under the countdown — usually the primary action for this brief. */
  action?: React.ReactNode;
  className?: string;
};

const statusTone: Record<SetPieceStatusLabel, string> = {
  Open: 'text-accent-text border-accent-base',
  Judging: 'text-text border-line-strong',
  Closed: 'text-text-muted border-line',
  'Opens soon': 'text-text-muted border-line',
};

export function SetPieceCard({
  weekNo,
  title,
  briefText,
  status,
  countdown,
  action,
  className,
}: SetPieceCardProps) {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <span className="arena-label font-mono">Week {weekNo}</span>
          <span className={cn('arena-label rounded-full border px-2 py-0.5', statusTone[status])}>
            {status}
          </span>
        </div>

        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription className="leading-normal">{briefText}</CardDescription>
      </CardHeader>

      {countdown !== undefined && <CountdownBar {...countdown} />}
      {action !== undefined && <div className="flex">{action}</div>}
    </Card>
  );
}
