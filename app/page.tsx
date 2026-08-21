import Link from 'next/link';
import { SectionLabel } from '@/components/ui/card';
import { HYPOTHESES } from '@/lib/config/hypotheses';
import { anonymous, getCurrentSeason, listCategories, listOpenSetPieces } from '@/lib/db';

/**
 * Scaffold placeholder. Still no features — the design language is Prompt 2 and the
 * voting surface is Prompt 5.
 *
 * It reads two things on purpose. The hypotheses prove the framework-free /lib layer is
 * wired to the app layer. The seeded drop below proves the whole data path works end to
 * end: page -> data-access layer -> Neon, with an `anonymous()` actor, through the same
 * door every future query has to use.
 */

// The seeded drop is read per-request. Without this the page is prerendered at build
// time, and `npm run build` has to keep working with no database credentials at all.
export const dynamic = 'force-dynamic';

type SeededDrop = {
  categoryName: string;
  seasonNumber: number;
  briefs: Array<{ id: string; weekNo: number; title: string; submitBy: Date }>;
};

/**
 * Returns null rather than throwing when there is no database. A missing local .env
 * should leave you looking at a page that explains itself, not a stack trace.
 */
async function readSeededDrop(): Promise<SeededDrop | null> {
  try {
    const actor = anonymous();
    const categories = await listCategories(actor);
    const category = categories[0];
    if (category === undefined) return null;

    const season = await getCurrentSeason(actor, category.id);
    if (season === null) return null;

    const briefs = await listOpenSetPieces(actor, season.id);
    return {
      categoryName: category.name,
      seasonNumber: season.number,
      briefs: briefs.map((brief) => ({
        id: brief.id,
        weekNo: brief.weekNo,
        title: brief.title,
        submitBy: brief.submitBy,
      })),
    };
  } catch {
    return null;
  }
}

export default async function Home() {
  const drop = await readSeededDrop();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-10 p-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight">Arena</h1>
        <p className="text-text-muted text-balance">
          Performers ranked against each other by blind pairwise voting on an identical weekly task,
          plus a weighted judge panel. Not a social network.
        </p>
        <Link href="/design-system" className="text-accent-text text-sm font-medium underline">
          See the design system
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <SectionLabel>Current drop</SectionLabel>
        {drop === null ? (
          <p className="text-text-muted text-sm">
            No open season found. Run <code className="font-mono">npm run db:migrate</code> then{' '}
            <code className="font-mono">npm run db:seed</code>.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {drop.categoryName} · Season {drop.seasonNumber}
            </p>
            <ol className="divide-line divide-y text-sm">
              {drop.briefs.map((brief) => (
                <li key={brief.id} className="flex items-baseline justify-between gap-4 py-2">
                  <span>
                    <span className="text-text-subtle font-mono text-xs">W{brief.weekNo}</span>{' '}
                    {brief.title}
                  </span>
                  <span className="arena-label whitespace-nowrap">
                    {brief.submitBy < new Date() ? 'Closed' : 'Open'}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-text-subtle text-xs">
              Read through the data-access layer as an anonymous actor. Voting is Prompt 5.
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Working hypotheses</SectionLabel>
        <dl className="divide-line divide-y text-sm">
          {Object.entries(HYPOTHESES).map(([name, value]) => (
            <div key={name} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="text-text-muted font-mono text-xs">{name}</dt>
              <dd className="arena-numeric font-mono">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-text-subtle text-xs">
          Guesses, not findings. See <code className="font-mono">lib/config/hypotheses.ts</code>.
        </p>
      </section>
    </main>
  );
}
