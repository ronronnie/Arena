import {
  advanceSetPieceStatus,
  countEligibleEntries,
  listLifecycleCandidates,
  system,
} from '@/lib/db';
import { cron } from 'inngest';
import { nextTransition } from '@/lib/domain/dropLifecycle';
import { dropEntriesClosed, dropJudgingClosed, dropOpened, inngest } from '../client';
import { reviveCandidate } from '../revive';

/**
 * The drop lifecycle: open -> entries close -> judging closes.
 *
 * Runs every fifteen minutes rather than being scheduled per drop. A per-drop timer is
 * more elegant and more fragile — it has to be created when a brief is published, moved
 * when a date is edited, and cancelled when one is unpublished, and any of those going
 * wrong is silent. A sweep re-derives everything from the rows each time, so the worst a
 * missed run can do is delay an event by a quarter of an hour.
 *
 * **The screens do not depend on this.** Phase is derived from the clock
 * (`lib/domain/dropLifecycle.ts`), so a job that never runs cannot make the product tell
 * a user that entries are open when they are not. What these events drive is everything
 * that has to HAPPEN at a boundary: notifications, and from Prompt 10, rating
 * recomputation.
 */

/** Matches the cron below. Anything that crossed a boundary inside this window is new. */
const SWEEP_INTERVAL_MS = 15 * 60_000;

const crossedRecently = (moment: Date, now: Date): boolean => {
  const delta = now.getTime() - moment.getTime();
  return delta >= 0 && delta < SWEEP_INTERVAL_MS;
};

export const dropLifecycle = inngest.createFunction(
  { id: 'drop-lifecycle', name: 'Drop lifecycle sweep', triggers: [cron('*/15 * * * *')] },
  async ({ step }) => {
    const now = new Date();
    const actor = system('scheduled drop lifecycle sweep');

    // `step.run` results come back through JSON, so the dates arrive as strings.
    const candidates = (
      await step.run('load-briefs', async () => listLifecycleCandidates(actor))
    ).map(reviveCandidate);

    const opened: string[] = [];
    const entriesClosed: string[] = [];
    const judgingClosed: string[] = [];

    for (const drop of candidates) {
      if (drop.status !== 'published' && drop.status !== 'closed') continue;

      /*
       * `drop/opened` and `drop/entries.closed` are edge detections, not state changes —
       * a brief's status stays `published` right through both. They are therefore
       * at-least-once: a sweep that runs twice inside the same window emits twice.
       * Subscribers must be idempotent, which is the rule already written into
       * inngest/README.md.
       */
      if (drop.status === 'published' && crossedRecently(drop.opensAt, now)) {
        await step.sendEvent(
          'announce-open',
          dropOpened.create({
            setPieceId: drop.id,
            categoryId: drop.categoryId,
            weekNo: drop.weekNo,
          }),
        );
        opened.push(drop.id);
      }

      if (drop.status === 'published' && crossedRecently(drop.submitBy, now)) {
        const entryCount = await step.run(`count-entries-${drop.id}`, async () =>
          countEligibleEntries(actor, drop.id),
        );

        await step.sendEvent(
          'announce-entries-closed',
          dropEntriesClosed.create({
            setPieceId: drop.id,
            categoryId: drop.categoryId,
            entryCount,
          }),
        );
        entriesClosed.push(drop.id);
      }

      /*
       * This one IS a state change, and it is the reason the sweep is safe to retry:
       * `advanceSetPieceStatus` matches on the current status, so the second attempt
       * updates nothing and returns false, and no event is sent.
       */
      const transition = nextTransition(drop, now);
      if (transition !== null) {
        const moved = await step.run(`close-${drop.id}`, async () =>
          advanceSetPieceStatus(actor, {
            setPieceId: drop.id,
            from: 'published',
            to: transition.to,
          }),
        );

        if (moved) {
          await step.sendEvent(
            'announce-judging-closed',
            dropJudgingClosed.create({ setPieceId: drop.id, categoryId: drop.categoryId }),
          );
          judgingClosed.push(drop.id);
        }
      }
    }

    return {
      sweptAt: now.toISOString(),
      considered: candidates.length,
      opened,
      entriesClosed,
      judgingClosed,
    };
  },
);
