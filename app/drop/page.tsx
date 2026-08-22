import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle, SectionLabel } from '@/components/ui/card';
import { CountdownBar } from '@/components/ui/countdown-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { VideoTile } from '@/components/ui/video-tile';
import { getActor, getSessionUser } from '@/lib/auth/session';
import {
  getCurrentDrop,
  getUpcomingDrop,
  listCategories,
  resolveDropCategory,
  type Drop,
} from '@/lib/db';
import { cn } from '@/lib/ui/cn';

/**
 * `/drop` — this week's brief.
 *
 * The ritual, rendered honestly. Every phase gets its own state on this page, and the
 * phase comes from the clock rather than from a status column, so a scheduled job that
 * fails to run cannot leave this screen telling somebody entries are open when they
 * closed an hour ago.
 *
 * Readable signed out: a brief is the advertisement for the whole product, and Core rule 4
 * is audience-first. What changes when you sign in is the call to action, not the content.
 */
export const dynamic = 'force-dynamic';

export default async function DropPage() {
  const actor = await getActor();
  const user = await getSessionUser();

  const categoryId = await resolveViewerCategory(user?.profile?.primaryCategoryId ?? null);
  if (categoryId === null) {
    return (
      <Shell slug="default">
        <EmptyState
          title="No disciplines are running yet"
          description="Arena runs one brief a week per discipline. When the first season opens, it will appear here."
        />
      </Shell>
    );
  }

  const discipline = await resolveDropCategory(actor, categoryId);
  const drop = await getCurrentDrop(actor, discipline?.id ?? categoryId);
  const upcoming = await getUpcomingDrop(actor, discipline?.id ?? categoryId);

  if (drop === null) {
    return (
      <Shell slug={discipline?.slug ?? 'default'}>
        <EmptyState
          title="No brief has opened yet"
          description={
            upcoming === null
              ? 'The first brief of the season is being written. Nothing to do until it lands.'
              : `Week ${upcoming.weekNo} opens in ${upcoming.remainingLabel.replace(' left', '')}.`
          }
        />
      </Shell>
    );
  }

  return (
    <Shell slug={discipline?.slug ?? 'default'}>
      <DropHeader drop={drop} />
      <BriefBody drop={drop} />
      <PhaseAction drop={drop} signedIn={user !== null} />

      {upcoming !== null && (
        <p className="text-text-subtle text-sm">
          Week {upcoming.weekNo} opens in {upcoming.remainingLabel.replace(' left', '')}.
        </p>
      )}

      <Link href="/drop/archive" className="text-accent-text text-sm font-medium underline">
        Past briefs and their results
      </Link>
    </Shell>
  );
}

/** A signed-out visitor still gets a drop — the first category running a season. */
async function resolveViewerCategory(profileCategoryId: string | null): Promise<string | null> {
  if (profileCategoryId !== null) return profileCategoryId;

  const actor = await getActor();
  const categories = await listCategories(actor);
  return categories.find((category) => category.parentId === null)?.id ?? null;
}

function Shell({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6"
      // The accent ramp follows the discipline, so a bharatanatyam brief and a metal
      // vocals brief do not feel like the same room.
      data-category={slug}
    >
      {children}
    </main>
  );
}

function DropHeader({ drop }: { drop: Drop }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Week {drop.weekNo}</SectionLabel>
        <span
          className={cn(
            'arena-label rounded-full border px-2 py-0.5',
            drop.phase === 'open'
              ? 'border-accent-base text-accent-text'
              : 'border-line text-text-muted',
          )}
        >
          {drop.phaseLabel}
        </span>
      </div>

      <h1 className="font-display text-2xl leading-snug font-bold tracking-tight">{drop.title}</h1>
      <p className="text-text-muted text-sm leading-normal">{drop.phaseDescription}</p>

      {drop.deadline !== null && drop.remainingLabel !== null && (
        <CountdownBar
          elapsed={drop.progress}
          closesLabel={`${drop.deadlineLabel} ${formatDay(drop.deadline)}`}
          remainingLabel={drop.remainingLabel}
          urgent={drop.urgent}
        />
      )}
    </header>
  );
}

function BriefBody({ drop }: { drop: Drop }) {
  const requirements = requirementList(drop);

  return (
    <>
      {drop.tutorialMuxAssetId !== null && (
        <VideoTile
          src={drop.tutorialMuxAssetId}
          label={`Tutorial for week ${drop.weekNo}`}
          className="max-w-[220px]"
        />
      )}

      <Card>
        <CardTitle className="text-base">The brief</CardTitle>
        <CardDescription className="text-text text-base leading-normal">
          {drop.briefText}
        </CardDescription>
      </Card>

      {requirements.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionLabel>What it has to meet</SectionLabel>
          {/*
           * A checklist, not prose. These are the conditions the eligibility engine
           * (Prompt 9) will actually check, so a competitor should be able to read them
           * one at a time and know where they stand.
           */}
          <ul className="divide-line divide-y text-sm">
            {requirements.map((requirement) => (
              <li key={requirement} className="flex items-start gap-2 py-2">
                <span aria-hidden="true" className="text-text-subtle mt-0.5">
                  •
                </span>
                <span>{requirement}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-1">
        <SectionLabel>Entries so far</SectionLabel>
        <p className="arena-numeric font-display text-2xl leading-tight font-semibold">
          {drop.entryCount}
        </p>
        <p className="text-text-subtle text-xs">
          {/* The count is public; who entered is not, until a vote is recorded. */}
          Everyone performs this same brief, which is what makes the comparison fair.
        </p>
      </section>

      {drop.track !== null && (
        <p className="text-text-subtle text-xs">
          Track: {drop.track.title} — {drop.track.artist}. Licensed from {drop.track.licensor}.
          {drop.creatorCredit !== null && ` Brief by ${drop.creatorCredit}.`}
        </p>
      )}
    </>
  );
}

/** One call to action per phase, and never one the phase cannot honour. */
function PhaseAction({ drop, signedIn }: { drop: Drop; signedIn: boolean }) {
  if (drop.phase === 'upcoming') {
    return <p className="text-text-muted text-sm">Entries are not open yet.</p>;
  }

  if (drop.phase === 'open') {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="primary" size="lg" block asChild>
          <Link href={signedIn ? '/vote' : '/sign-in?next=/drop'}>
            {signedIn ? 'Judge this brief' : 'Start judging'}
          </Link>
        </Button>
        {/*
         * Core rule 4. Entering is never offered as an alternative to judging — it is
         * what judging unlocks. The wording says so rather than hiding a disabled button.
         */}
        <p className="text-text-subtle text-xs">
          Judging is how entering unlocks. Most people here only ever judge, and that is the point.
        </p>
      </div>
    );
  }

  if (drop.phase === 'judging') {
    return (
      <Button variant="primary" size="lg" block asChild>
        <Link href={signedIn ? '/vote' : '/sign-in?next=/drop'}>Compare entries</Link>
      </Button>
    );
  }

  return (
    <Button variant="secondary" size="lg" block asChild>
      <Link href="/drop/archive">See the results</Link>
    </Button>
  );
}

function requirementList(drop: Drop): string[] {
  const requirements: string[] = [];
  const spec = drop.requirements;

  if (typeof spec.durationS === 'number') requirements.push(`About ${spec.durationS} seconds long`);
  if (typeof spec.framing === 'string') requirements.push(`Framing: ${spec.framing}`);
  if (typeof spec.takes === 'number') {
    requirements.push(
      spec.takes === 1 ? 'One unbroken take, no cuts' : `Up to ${spec.takes} takes`,
    );
  }
  if (typeof spec.wardrobe === 'string') requirements.push(`Wardrobe: ${spec.wardrobe}`);

  return requirements;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'long' });
}
