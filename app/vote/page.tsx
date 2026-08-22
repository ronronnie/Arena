import { redirect } from 'next/navigation';
import { Card, CardDescription, CardTitle, SectionLabel } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ProgressRing } from '@/components/ui/progress-ring';
import { UNLOCK_THRESHOLD } from '@/lib/config/hypotheses';
import { getActor, getSessionUser } from '@/lib/auth/session';
import { getCurrentSeason, listOpenSetPieces, resolveDropCategory } from '@/lib/db';

/**
 * The voting screen.
 *
 * **This is a landing surface, not the voting experience.** Prompt 5 builds that — blind
 * pairs, the scrub-sync compare, the reveal — and it is described in the pack as the most
 * important surface in the app. Half-building it here would mean tuning the most
 * consequential screen in the product against a page that was never designed.
 *
 * What this route does have to be, today, is a real destination: Core rule 4 says
 * onboarding drops a new user straight into judging, and that redirect needs somewhere to
 * land. So this shows the brief they are about to judge and their progress toward the
 * compete-unlock, which is the honest state of things.
 *
 * It also owns the onboarding guard for the signed-in area. `proxy.ts` deliberately only
 * answers "is anyone signed in" — deciding whether onboarding is finished needs a profile
 * read, and Next's docs are explicit that proxy code should not depend on shared modules
 * or a database.
 */
// Reads the session cookie, so it can never be prerendered. Declared rather than left to
// Next to discover, which it reports at build time as a `DYNAMIC_SERVER_USAGE` error —
// correct behaviour that reads like a fault.
export const dynamic = 'force-dynamic';

export default async function VotePage() {
  const user = await getSessionUser();
  if (user === null) redirect('/sign-in?next=/vote');
  if (!user.onboarding.isComplete) redirect('/onboarding');

  const actor = await getActor();
  const profile = user.profile;

  /*
   * The stored category is the sub-style the judge picked; drops hang off the discipline
   * above it. `resolveDropCategory` walks up, and also hands back the slug the accent ramp
   * is keyed by — so a bharatanatyam judge gets the gold ramp and a metal vocalist gets
   * violet, from their own profile rather than from a hardcoded default.
   */
  const discipline =
    profile?.primaryCategoryId == null
      ? null
      : await resolveDropCategory(actor, profile.primaryCategoryId);

  const season = discipline === null ? null : await getCurrentSeason(actor, discipline.id);
  const briefs = season === null ? [] : await listOpenSetPieces(actor, season.id);
  const openBrief = briefs.at(-1) ?? null;

  const judged = profile?.comparisonsCompleted ?? 0;
  const unlocked = profile?.competeUnlockedAt != null;

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 p-6"
      data-category={discipline?.slug ?? 'default'}
    >
      <header className="flex flex-col gap-2">
        <SectionLabel>Judging</SectionLabel>
        <h1 className="font-display text-2xl leading-snug font-bold tracking-tight">
          Welcome, {profile?.displayName ?? 'judge'}
        </h1>
      </header>

      {openBrief === null ? (
        <EmptyState
          title="No brief is open right now"
          description="A new brief drops each week. When it does, this is where you will compare entries."
        />
      ) : (
        <Card>
          <span className="arena-label font-mono">Week {openBrief.weekNo}</span>
          <CardTitle>{openBrief.title}</CardTitle>
          <CardDescription className="leading-normal">{openBrief.briefText}</CardDescription>
        </Card>
      )}

      <section className="flex items-center gap-5">
        <ProgressRing
          value={Math.min(judged, UNLOCK_THRESHOLD)}
          max={UNLOCK_THRESHOLD}
          label="comparisons judged"
          caption={unlocked ? 'unlocked' : 'judged'}
        />
        <div className="flex flex-col gap-1">
          <p className="text-base font-medium">
            {unlocked ? 'You can enter briefs' : 'Judging unlocks entering'}
          </p>
          <p className="text-text-muted text-sm leading-normal">
            {unlocked
              ? 'You judged your way in. Entering stays optional — most people here only ever judge.'
              : `Compare ${UNLOCK_THRESHOLD} pairs and the option to enter opens up. There is no other way to it.`}
          </p>
        </div>
      </section>

      <p className="text-text-subtle text-xs">
        The blind pair comparison itself arrives in Prompt 5. This screen is the destination
        onboarding hands you to.
      </p>
    </main>
  );
}
