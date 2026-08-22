import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardDescription, CardTitle, SectionLabel } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getActor, getSessionUser } from '@/lib/auth/session';
import { getCurrentDrop, nextBlindPair, resolveDropCategory } from '@/lib/db';
import { VoteSurface } from './vote-surface';

/**
 * The voting screen — the most important surface in the app.
 *
 * The server does three things and hands the rest to the client: works out which brief
 * this judge is on, draws the first pair so the screen has something on it in the first
 * paint, and gets out of the way. Every subsequent pair comes from a server action, which
 * is what lets the next one be fetched while the current one is still being watched.
 *
 * This route also owns the onboarding guard for the signed-in area. `proxy.ts` deliberately
 * only answers "is anyone signed in" — deciding whether onboarding is finished needs a
 * profile read, and Next's docs are explicit that proxy code should not depend on shared
 * modules or a database.
 */
export const dynamic = 'force-dynamic';

export default async function VotePage() {
  const user = await getSessionUser();
  if (user === null) redirect('/sign-in?next=/vote');
  if (!user.onboarding.isComplete) redirect('/onboarding');

  const actor = await getActor();
  const profile = user.profile;

  const discipline =
    profile?.primaryCategoryId == null
      ? null
      : await resolveDropCategory(actor, profile.primaryCategoryId);

  const drop = discipline === null ? null : await getCurrentDrop(actor, discipline.id);

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6"
      data-category={discipline?.slug ?? 'default'}
    >
      {drop === null ? (
        <>
          <SectionLabel>Judging</SectionLabel>
          <EmptyState
            title="No brief is open right now"
            description="A new brief drops each week. When it does, this is where you compare entries."
            action={
              <Link href="/drop" className="text-accent-text text-sm font-medium underline">
                See the drop
              </Link>
            }
          />
        </>
      ) : drop.phase !== 'judging' && drop.phase !== 'open' ? (
        <>
          <SectionLabel>Judging</SectionLabel>
          <Card>
            <CardTitle>{drop.title}</CardTitle>
            <CardDescription>{drop.phaseDescription}</CardDescription>
          </Card>
        </>
      ) : (
        <VoteSurface
          setPieceId={drop.id}
          /*
           * Drawn on the server so the first pair is in the first paint. Everything after
           * this comes from a server action, prefetched while the judge is still watching.
           */
          initialPair={await nextBlindPair(actor, drop.id)}
          startingCompleted={profile?.comparisonsCompleted ?? 0}
          briefTitle={`Week ${drop.weekNo} · ${drop.title}`}
        />
      )}

      <Link href="/drop" className="text-text-subtle text-xs underline">
        About this brief
      </Link>
    </main>
  );
}
