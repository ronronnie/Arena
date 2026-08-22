import Link from 'next/link';
import { Card, CardDescription, CardTitle, SectionLabel } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getActor, getSessionUser } from '@/lib/auth/session';
import { listCategories, listPastDrops, resolveDropCategory } from '@/lib/db';

/**
 * The archive — briefs whose judging has finished.
 *
 * The pack asks for "past set pieces archive with the winning entries". The briefs and
 * their entry counts are here; **the winners are not, yet.** Nothing in the database can
 * answer "who won" honestly: ratings are seeded rather than computed, and the Glicko-2
 * engine that turns comparisons into a result is Prompt 10.
 *
 * Showing a placeholder winner would be worse than showing none. Core rule 6 says every
 * number must be explainable, and "this person won" is the least explainable claim the
 * product can make if it is not derived from the comparisons.
 */
export const dynamic = 'force-dynamic';

export default async function ArchivePage() {
  const actor = await getActor();
  const user = await getSessionUser();

  const categories = await listCategories(actor);
  const chosen = user?.profile?.primaryCategoryId ?? null;
  const fallback = categories.find((category) => category.parentId === null)?.id ?? null;
  const categoryId = chosen ?? fallback;

  if (categoryId === null) {
    return (
      <Shell slug="default">
        <EmptyState
          title="Nothing has run yet"
          description="Finished briefs and their results collect here at the end of each week."
        />
      </Shell>
    );
  }

  const discipline = await resolveDropCategory(actor, categoryId);
  const past = await listPastDrops(actor, discipline?.id ?? categoryId);

  return (
    <Shell slug={discipline?.slug ?? 'default'}>
      <header className="flex flex-col gap-2">
        <SectionLabel>Archive</SectionLabel>
        <h1 className="font-display text-2xl leading-snug font-bold tracking-tight">
          Briefs that have finished
        </h1>
      </header>

      {past.length === 0 ? (
        <EmptyState
          title="Nothing has finished yet"
          description="Briefs collect here once their judging window closes."
        />
      ) : (
        <ol className="flex flex-col gap-4">
          {past.map((drop) => (
            <li key={drop.id}>
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <span className="arena-label font-mono">Week {drop.weekNo}</span>
                  <span className="arena-label">{drop.phaseLabel}</span>
                </div>
                <CardTitle className="text-base">{drop.title}</CardTitle>
                <CardDescription>{drop.briefText}</CardDescription>
                <p className="text-text-subtle text-xs">
                  <span className="arena-numeric">{drop.entryCount}</span> entries judged
                </p>
              </Card>
            </li>
          ))}
        </ol>
      )}

      <p className="text-text-subtle text-xs">
        Results per brief arrive with the rating engine in Prompt 10. Until comparisons are turned
        into ratings, naming a winner here would be a number nobody could explain.
      </p>

      <Link href="/drop" className="text-accent-text text-sm font-medium underline">
        Back to this week
      </Link>
    </Shell>
  );
}

function Shell({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6" data-category={slug}>
      {children}
    </main>
  );
}
