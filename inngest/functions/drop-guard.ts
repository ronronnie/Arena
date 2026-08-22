import { listActiveCategories, listLifecycleCandidates, system } from '@/lib/db';
import { cron } from 'inngest';
import { DROP_WARNING_LEAD_MS, needsDropWarning } from '@/lib/domain/dropLifecycle';
import { dropMissingWarning, inngest } from '../client';
import { reviveCandidate } from '../revive';

/**
 * The missed-drop guard.
 *
 * The prompt pack asks for a weekly cron that "warns admin 72h before the next drop if no
 * set piece is published for an active category — a missed drop breaks the ritual and
 * must page you". That framing is right and worth keeping: Arena competes for a habit
 * slot, and a habit that skips a week is a habit somebody has stopped having. This is the
 * one alert in the system meant to wake a person up.
 *
 * It runs DAILY rather than weekly, deliberately. A weekly check that happens to run
 * three hours after the 72-hour mark passes has missed the thing it exists to catch, and
 * a weekly check that fails once leaves a fortnight uncovered. Daily costs nothing and
 * the warning is idempotent — Prompt 18 owns not sending the same alert seven times.
 */

/** How often a brief is expected. The weekly ritual is the product's heartbeat. */
const DROP_CADENCE_MS = 7 * 86_400_000;

export const dropGuard = inngest.createFunction(
  {
    id: 'drop-guard',
    name: 'Warn when a category has no drop coming',
    triggers: [cron('0 9 * * *')],
  },
  async ({ step }) => {
    const now = new Date();
    const actor = system('scheduled missed-drop guard');

    const [categories, rawBriefs] = await Promise.all([
      step.run('load-active-categories', async () => listActiveCategories(actor)),
      step.run('load-briefs', async () => listLifecycleCandidates(actor)),
    ]);

    // `step.run` results come back through JSON, so the dates arrive as strings.
    const briefs = rawBriefs.map(reviveCandidate);

    const warned: string[] = [];

    for (const category of categories) {
      const forCategory = briefs
        .filter((brief) => brief.categoryId === category.categoryId)
        .sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime());

      const lastOpened = forCategory
        .filter((brief) => brief.opensAt.getTime() <= now.getTime())
        .at(-1);

      /*
       * When the next brief is due. Anchored to the last one that actually opened, so a
       * category running late does not get quietly forgiven for being late — the expected
       * date keeps moving forward from reality, not from the schedule we wish we had.
       */
      const expectedNextOpenAt =
        lastOpened === undefined
          ? new Date(now.getTime() + DROP_CADENCE_MS)
          : new Date(lastOpened.opensAt.getTime() + DROP_CADENCE_MS);

      /*
       * Only a PUBLISHED brief counts as covering the slot. A draft sitting in the admin
       * screen is exactly the situation this alert exists to catch — somebody wrote it
       * and did not press publish, and the licence check may still be blocking them.
       */
      const nextPublished = forCategory
        .filter((brief) => brief.status === 'published' && brief.opensAt.getTime() > now.getTime())
        .at(0);

      const shouldWarn = needsDropWarning({
        nextOpensAt: nextPublished?.opensAt ?? null,
        expectedNextOpenAt,
        now,
      });

      if (!shouldWarn) continue;

      const hoursRemaining = Math.max(
        0,
        Math.round((expectedNextOpenAt.getTime() - now.getTime()) / 3_600_000),
      );

      await step.sendEvent(
        'warn-missing-drop',
        dropMissingWarning.create({
          categoryId: category.categoryId,
          categoryName: category.categoryName,
          expectedOpenAt: expectedNextOpenAt.toISOString(),
          hoursRemaining,
        }),
      );
      warned.push(category.categoryName);
    }

    return {
      checkedAt: now.toISOString(),
      categories: categories.length,
      leadHours: DROP_WARNING_LEAD_MS / 3_600_000,
      warned,
    };
  },
);
