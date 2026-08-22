/**
 * The drop lifecycle, and its boundaries.
 *
 * The prompt pack asks for "lifecycle transitions, license gating, countdown boundary
 * behaviour". Licence gating is enforced by a database trigger and tested against a real
 * Postgres in `tests/integration/constraints.test.ts`; the other two are here.
 *
 * Boundaries get more attention than the happy path, because a drop is a deadline and a
 * deadline is entirely made of edges. A brief that says "closes at 18:00" accepting an
 * entry at 18:00:00.000 is the kind of thing nobody notices until someone is angry about
 * it.
 */

import { describe, expect, it } from 'vitest';
import {
  DROP_WARNING_LEAD_MS,
  acceptsEntries,
  acceptsVotes,
  dropPhase,
  formatRemaining,
  isUrgent,
  needsDropWarning,
  nextTransition,
  presentPhase,
  windowProgress,
  type DropWindow,
} from '@/lib/domain/dropLifecycle';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const opensAt = new Date('2026-08-10T00:00:00Z');
const submitBy = new Date('2026-08-17T00:00:00Z');
const judgingEndsAt = new Date('2026-08-20T00:00:00Z');

const drop = (overrides: Partial<DropWindow> = {}): DropWindow => ({
  status: 'published',
  opensAt,
  submitBy,
  judgingEndsAt,
  ...overrides,
});

describe('phases', () => {
  it('hides a draft and a scheduled brief from everyone', () => {
    // A brief nobody has published must not leak — next week's task is the whole ritual.
    expect(dropPhase(drop({ status: 'draft' }), new Date('2026-08-12T00:00:00Z'))).toBe('hidden');
    expect(dropPhase(drop({ status: 'scheduled' }), new Date('2026-08-12T00:00:00Z'))).toBe(
      'hidden',
    );
  });

  it('is upcoming while published but not yet open', () => {
    expect(dropPhase(drop(), new Date('2026-08-09T23:59:59Z'))).toBe('upcoming');
  });

  it('is open from the exact instant it opens', () => {
    expect(dropPhase(drop(), opensAt)).toBe('open');
  });

  it('is open one millisecond before the deadline', () => {
    expect(dropPhase(drop(), new Date(submitBy.getTime() - 1))).toBe('open');
  });

  it('is judging at the exact instant of the deadline, not open', () => {
    // The half-open boundary. "Closes at 18:00" means an entry at 18:00 is too late.
    expect(dropPhase(drop(), submitBy)).toBe('judging');
  });

  it('is judging one millisecond before judging ends', () => {
    expect(dropPhase(drop(), new Date(judgingEndsAt.getTime() - 1))).toBe('judging');
  });

  it('shows results from the exact instant judging ends', () => {
    expect(dropPhase(drop(), judgingEndsAt)).toBe('results');
  });

  it('reports an archived brief as archived whatever the clock says', () => {
    expect(dropPhase(drop({ status: 'archived' }), opensAt)).toBe('archived');
  });

  it('reports a closed brief by its window, so a late job cannot make it lie', () => {
    // `closed` is a stored status; the phase still comes from the clock. This is the
    // whole reason phase is derived — a missed cron must not change what a user is told.
    expect(dropPhase(drop({ status: 'closed' }), new Date('2026-08-12T00:00:00Z'))).toBe('open');
  });
});

describe('what each phase permits', () => {
  it('takes entries only while open', () => {
    expect(acceptsEntries(drop(), new Date('2026-08-12T00:00:00Z'))).toBe(true);
    expect(acceptsEntries(drop(), new Date(submitBy.getTime() - 1))).toBe(true);
    expect(acceptsEntries(drop(), submitBy)).toBe(false);
    expect(acceptsEntries(drop(), new Date('2026-08-09T00:00:00Z'))).toBe(false);
  });

  it('takes votes only while judging', () => {
    expect(acceptsVotes(drop(), new Date(submitBy.getTime() - 1))).toBe(false);
    expect(acceptsVotes(drop(), submitBy)).toBe(true);
    expect(acceptsVotes(drop(), new Date(judgingEndsAt.getTime() - 1))).toBe(true);
    expect(acceptsVotes(drop(), judgingEndsAt)).toBe(false);
  });

  it('never takes entries and votes at the same moment', () => {
    // Entries closing is what makes the comparison fair — everyone had the same window.
    for (let t = opensAt.getTime() - DAY; t < judgingEndsAt.getTime() + DAY; t += HOUR) {
      const at = new Date(t);
      expect(acceptsEntries(drop(), at) && acceptsVotes(drop(), at)).toBe(false);
    }
  });
});

describe('presentation', () => {
  it('names each phase in words, never by colour alone', () => {
    expect(presentPhase(drop(), new Date('2026-08-12T00:00:00Z')).label).toBe('Open');
    expect(presentPhase(drop(), submitBy).label).toBe('Judging');
    expect(presentPhase(drop(), judgingEndsAt).label).toBe('Results');
  });

  it('points the countdown at the deadline that matters in that phase', () => {
    expect(presentPhase(drop(), new Date('2026-08-12T00:00:00Z')).deadline).toEqual(submitBy);
    expect(presentPhase(drop(), submitBy).deadline).toEqual(judgingEndsAt);
    expect(presentPhase(drop(), judgingEndsAt).deadline).toBeNull();
  });

  it('avoids the vocabulary the copy rules ban', () => {
    for (const at of [opensAt, submitBy, judgingEndsAt]) {
      const { label, description } = presentPhase(drop(), at);
      expect(`${label} ${description}`.toLowerCase()).not.toMatch(/\b(lost|failed|worst)\b/);
    }
  });
});

describe('countdown', () => {
  it('rounds down, so nobody is told they have more time than they do', () => {
    // 47 hours is "1 day left", not "2 days".
    expect(formatRemaining(47 * HOUR)).toBe('1 day left');
    expect(formatRemaining(2 * DAY)).toBe('2 days left');
  });

  it('handles the singular at every unit', () => {
    expect(formatRemaining(DAY)).toBe('1 day left');
    expect(formatRemaining(HOUR)).toBe('1 hour left');
    expect(formatRemaining(60_000)).toBe('1 minute left');
  });

  it('switches unit exactly at the boundary', () => {
    expect(formatRemaining(DAY - 1)).toBe('23 hours left');
    expect(formatRemaining(HOUR - 1)).toBe('59 minutes left');
    expect(formatRemaining(60_000 - 1)).toBe('Less than a minute left');
  });

  it('never counts seconds — Core rule 8 forbids manufactured urgency', () => {
    expect(formatRemaining(30_000)).toBe('Less than a minute left');
    expect(formatRemaining(1_000)).toBe('Less than a minute left');
  });

  it('says Closed at and past zero', () => {
    expect(formatRemaining(0)).toBe('Closed');
    expect(formatRemaining(-1)).toBe('Closed');
    expect(formatRemaining(-DAY)).toBe('Closed');
  });

  it('marks the final day urgent, and nothing before it', () => {
    expect(isUrgent(DAY + 1)).toBe(false);
    expect(isUrgent(DAY - 1)).toBe(true);
    expect(isUrgent(0)).toBe(false);
  });
});

describe('window progress', () => {
  it('measures from the start of the CURRENT phase, not from opensAt', () => {
    // A bar already 90% full the moment judging begins tells the viewer nothing.
    expect(windowProgress(drop(), submitBy)).toBe(0);
    expect(windowProgress(drop(), new Date(submitBy.getTime() + 1.5 * DAY))).toBeCloseTo(0.5, 5);
  });

  it('is 0 at the moment entries open and 1 at the deadline', () => {
    expect(windowProgress(drop(), opensAt)).toBe(0);
    expect(windowProgress(drop(), new Date(submitBy.getTime() - 1))).toBeCloseTo(1, 4);
  });

  it('is full once results are out', () => {
    expect(windowProgress(drop(), judgingEndsAt)).toBe(1);
  });

  it('stays within 0 and 1 even for a nonsensical window', () => {
    const inverted = drop({ submitBy: opensAt });
    expect(windowProgress(inverted, opensAt)).toBeGreaterThanOrEqual(0);
    expect(windowProgress(inverted, opensAt)).toBeLessThanOrEqual(1);
  });
});

describe('scheduled transitions', () => {
  it('closes a published drop once judging has ended', () => {
    expect(nextTransition(drop(), judgingEndsAt)).toEqual({
      to: 'closed',
      because: 'the judging window has ended',
    });
  });

  it('does nothing while judging is still running', () => {
    expect(nextTransition(drop(), new Date(judgingEndsAt.getTime() - 1))).toBeNull();
  });

  it('is idempotent — a second run finds nothing to do', () => {
    // The job must be safe to retry. Drops are the product's heartbeat.
    expect(nextTransition(drop({ status: 'closed' }), judgingEndsAt)).toBeNull();
    expect(nextTransition(drop({ status: 'archived' }), judgingEndsAt)).toBeNull();
  });

  it('never publishes a draft', () => {
    // Publishing is a human decision with a licensing consequence, and the database
    // refuses it anyway unless the track licence covers the whole drop.
    expect(nextTransition(drop({ status: 'draft' }), judgingEndsAt)).toBeNull();
    expect(nextTransition(drop({ status: 'scheduled' }), opensAt)).toBeNull();
  });
});

describe('the missed-drop warning', () => {
  const expectedNextOpenAt = new Date('2026-09-01T00:00:00Z');
  const justInsideLead = new Date(expectedNextOpenAt.getTime() - DROP_WARNING_LEAD_MS + 1);
  const justOutsideLead = new Date(expectedNextOpenAt.getTime() - DROP_WARNING_LEAD_MS - 1);

  it('stays quiet while there is still more than 72 hours', () => {
    expect(needsDropWarning({ nextOpensAt: null, expectedNextOpenAt, now: justOutsideLead })).toBe(
      false,
    );
  });

  it('warns inside 72 hours when nothing is published', () => {
    // A missed drop breaks the ritual, and the ritual is the product.
    expect(needsDropWarning({ nextOpensAt: null, expectedNextOpenAt, now: justInsideLead })).toBe(
      true,
    );
  });

  it('stays quiet when a brief already covers the slot', () => {
    expect(
      needsDropWarning({
        nextOpensAt: expectedNextOpenAt,
        expectedNextOpenAt,
        now: justInsideLead,
      }),
    ).toBe(false);
  });

  it('warns when the next published brief is too late to fill the slot', () => {
    expect(
      needsDropWarning({
        nextOpensAt: new Date(expectedNextOpenAt.getTime() + DAY),
        expectedNextOpenAt,
        now: justInsideLead,
      }),
    ).toBe(true);
  });

  it('uses a 72 hour lead', () => {
    expect(DROP_WARNING_LEAD_MS).toBe(72 * HOUR);
  });
});
