/**
 * The drop lifecycle — the weekly ritual the whole product runs on.
 *
 * A drop has two different notions of "where it is", and conflating them is the mistake
 * this module exists to prevent:
 *
 *   - **`status`** is a stored column, moved by admins and by scheduled jobs. It answers
 *     "has anyone decided this brief is ready to exist in public".
 *   - **`phase`** is DERIVED from the clock. It answers "what is happening right now".
 *
 * Deriving the phase rather than storing it is deliberate. If the phase were a column, a
 * missed cron would leave a brief showing "open for entries" hours after its deadline —
 * the ritual would be lying to the people it is asking to perform. Derived from
 * timestamps, the worst a missed job can do is fail to send a notification; the screens
 * stay honest on their own.
 *
 * Framework-free. Every screen, every scheduled function and every test reads the phase
 * from here.
 */

/** The stored lifecycle column. Matches `set_pieces.status`. */
export type SetPieceStatus = 'draft' | 'scheduled' | 'published' | 'closed' | 'archived';

/**
 * What is happening right now, from the audience's point of view.
 *
 * `hidden` covers everything the public must not see: a draft, and a brief scheduled but
 * not yet published. A published brief before `opensAt` is `upcoming` — it exists, it is
 * announced, and it has not started.
 */
export type DropPhase = 'hidden' | 'upcoming' | 'open' | 'judging' | 'results' | 'archived';

export type DropWindow = {
  status: SetPieceStatus;
  opensAt: Date;
  submitBy: Date;
  judgingEndsAt: Date;
};

/**
 * The phase of a drop at a given moment.
 *
 * Boundaries are half-open — `[opensAt, submitBy)` — so a drop is open right up to the
 * instant of its deadline and closed at it. A brief that says "closes at 18:00" must not
 * still accept an entry at 18:00:00.000, and the tests pin every one of these edges.
 */
export function dropPhase(drop: DropWindow, now: Date = new Date()): DropPhase {
  if (drop.status === 'draft' || drop.status === 'scheduled') return 'hidden';
  if (drop.status === 'archived') return 'archived';

  const at = now.getTime();
  if (at < drop.opensAt.getTime()) return 'upcoming';
  if (at < drop.submitBy.getTime()) return 'open';
  if (at < drop.judgingEndsAt.getTime()) return 'judging';
  return 'results';
}

/** Only an open drop takes entries. Nothing else in the codebase should decide this. */
export function acceptsEntries(drop: DropWindow, now: Date = new Date()): boolean {
  return dropPhase(drop, now) === 'open';
}

/** Judging runs between the entry deadline and the end of the judging window. */
export function acceptsVotes(drop: DropWindow, now: Date = new Date()): boolean {
  return dropPhase(drop, now) === 'judging';
}

/* ------------------------------------------------------------------------------------
 * What each phase says to a user
 * ---------------------------------------------------------------------------------- */

export type PhasePresentation = {
  /** The status word on a card. Never a bare colour. */
  label: string;
  /** One plain sentence about what is happening. */
  description: string;
  /** The deadline the countdown is running towards, if there is one. */
  deadline: Date | null;
  /** Wording for the deadline. */
  deadlineLabel: string | null;
};

export function presentPhase(drop: DropWindow, now: Date = new Date()): PhasePresentation {
  switch (dropPhase(drop, now)) {
    case 'hidden':
      return {
        label: 'Not published',
        description: 'This brief is not visible to anyone yet.',
        deadline: null,
        deadlineLabel: null,
      };
    case 'upcoming':
      return {
        label: 'Opens soon',
        description: 'The brief is announced. Entries open shortly.',
        deadline: drop.opensAt,
        deadlineLabel: 'Opens',
      };
    case 'open':
      return {
        label: 'Open',
        description: 'Everyone performs this same brief. Enter before the deadline.',
        deadline: drop.submitBy,
        deadlineLabel: 'Closes',
      };
    case 'judging':
      return {
        label: 'Judging',
        description: 'Entries are closed. Judges are comparing them blind, in pairs.',
        deadline: drop.judgingEndsAt,
        deadlineLabel: 'Results',
      };
    case 'results':
      return {
        label: 'Results',
        description: 'Judging is finished and the results are in.',
        deadline: null,
        deadlineLabel: null,
      };
    case 'archived':
      return {
        label: 'Archived',
        description: 'A brief from an earlier season.',
        deadline: null,
        deadlineLabel: null,
      };
  }
}

/* ------------------------------------------------------------------------------------
 * Countdown
 * ---------------------------------------------------------------------------------- */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "4 days left", "6 hours left", "12 minutes left".
 *
 * Coarse on purpose. Core rule 8 rules out manufactured urgency, so this never counts
 * seconds and never ticks — a live clock on a deadline is exactly the pressure the
 * product has promised not to apply. It rounds DOWN, because telling someone they have
 * "2 days" when they have 47 hours is a small lie in the direction that costs them.
 */
export function formatRemaining(msRemaining: number): string {
  if (msRemaining <= 0) return 'Closed';

  if (msRemaining >= DAY) {
    const days = Math.floor(msRemaining / DAY);
    return days === 1 ? '1 day left' : `${days} days left`;
  }

  if (msRemaining >= HOUR) {
    const hours = Math.floor(msRemaining / HOUR);
    return hours === 1 ? '1 hour left' : `${hours} hours left`;
  }

  if (msRemaining >= MINUTE) {
    const minutes = Math.floor(msRemaining / MINUTE);
    return minutes === 1 ? '1 minute left' : `${minutes} minutes left`;
  }

  // Under a minute. Still not a second-by-second clock.
  return 'Less than a minute left';
}

/** Inside the final day. Shifts the countdown to `caution` — and says so in words too. */
export function isUrgent(msRemaining: number): boolean {
  return msRemaining > 0 && msRemaining < DAY;
}

/**
 * How far through the current window we are, 0 to 1, for `CountdownBar`.
 *
 * Measured from the start of the phase the drop is actually in, not from `opensAt` — a
 * bar that is already 90% full the moment judging begins tells the viewer nothing.
 */
export function windowProgress(drop: DropWindow, now: Date = new Date()): number {
  const at = now.getTime();
  const phase = dropPhase(drop, now);

  const span =
    phase === 'open'
      ? { from: drop.opensAt.getTime(), to: drop.submitBy.getTime() }
      : phase === 'judging'
        ? { from: drop.submitBy.getTime(), to: drop.judgingEndsAt.getTime() }
        : null;

  if (span === null) return phase === 'results' || phase === 'archived' ? 1 : 0;

  const total = span.to - span.from;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (at - span.from) / total));
}

/* ------------------------------------------------------------------------------------
 * What the scheduled jobs should do
 * ---------------------------------------------------------------------------------- */

/**
 * The one transition a scheduled job may make to this drop right now, or null.
 *
 * Returning a single next step rather than a target state is what makes the lifecycle
 * job idempotent: run it twice and the second run finds nothing to do. A job that
 * computed "the status this drop ought to have" would happily rewrite a row an admin had
 * just archived by hand.
 *
 * Note what is NOT here: nothing advances a draft to published. Publishing is a human
 * decision with a licensing consequence, and the database refuses it anyway unless the
 * track's licence covers the whole drop.
 */
export type DropTransition = { to: SetPieceStatus; because: string };

export function nextTransition(drop: DropWindow, now: Date = new Date()): DropTransition | null {
  if (drop.status !== 'published') return null;

  if (now.getTime() >= drop.judgingEndsAt.getTime()) {
    return { to: 'closed', because: 'the judging window has ended' };
  }

  return null;
}

/**
 * Should we be worried that a category has no brief coming?
 *
 * A missed drop breaks the ritual, and the ritual is the product. The warning fires
 * `WARN_BEFORE_MS` ahead of the moment the next brief would need to open, so there is
 * still time to do something about it.
 */
export const DROP_WARNING_LEAD_MS = 72 * HOUR;

export function needsDropWarning(input: {
  nextOpensAt: Date | null;
  expectedNextOpenAt: Date;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const deadline = input.expectedNextOpenAt.getTime() - DROP_WARNING_LEAD_MS;

  if (now.getTime() < deadline) return false;
  // A published brief already covers the slot.
  return (
    input.nextOpensAt === null || input.nextOpensAt.getTime() > input.expectedNextOpenAt.getTime()
  );
}
