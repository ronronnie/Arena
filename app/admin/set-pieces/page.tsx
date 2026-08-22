import { Card, CardTitle, SectionLabel } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getActor } from '@/lib/auth/session';
import { listSetPiecesForAdmin } from '@/lib/db';
import { dropPhase } from '@/lib/domain/dropLifecycle';
import { PublishControls } from './publish-controls';

/**
 * Every brief, in every state — the only screen where drafts are visible.
 *
 * The licence gate is the point of this page. A brief that cannot publish says so, in a
 * sentence naming the actual problem, next to a disabled button. The database trigger is
 * what refuses; this is what makes the refusal actionable before somebody hits it.
 */
export const dynamic = 'force-dynamic';

export default async function AdminSetPiecesPage() {
  const actor = await getActor();
  const briefs = await listSetPiecesForAdmin(actor);
  const now = new Date();

  const blocked = briefs.filter(
    (brief) => brief.status !== 'published' && brief.publishBlockedBecause !== null,
  );

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl leading-snug font-bold tracking-tight">Briefs</h1>
        <p className="text-text-muted text-sm">
          {briefs.length} in total. {blocked.length} cannot be published yet.
        </p>
      </div>

      {briefs.length === 0 ? (
        <EmptyState
          title="No briefs yet"
          description="A brief needs a season, a licensed track, and a window that the licence covers."
        />
      ) : (
        <ol className="flex flex-col gap-4">
          {briefs.map((brief) => {
            const phase = dropPhase(brief, now);

            return (
              <li key={brief.id}>
                <Card>
                  <div className="flex items-center justify-between gap-3">
                    <span className="arena-label font-mono">Week {brief.weekNo}</span>
                    <span className="arena-label">
                      {brief.status}
                      {brief.status === 'published' && ` · ${phase}`}
                    </span>
                  </div>

                  <CardTitle className="text-base">{brief.title}</CardTitle>

                  <dl className="text-text-muted grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="arena-label">Opens</dt>
                    <dd className="arena-numeric">{formatDateTime(brief.opensAt)}</dd>
                    <dt className="arena-label">Closes</dt>
                    <dd className="arena-numeric">{formatDateTime(brief.submitBy)}</dd>
                    <dt className="arena-label">Judged by</dt>
                    <dd className="arena-numeric">{formatDateTime(brief.judgingEndsAt)}</dd>
                    <dt className="arena-label">Track</dt>
                    <dd>
                      {brief.trackTitle ?? <span className="text-caution">None attached</span>}
                      {brief.licenseExpiresAt !== null && (
                        <span className="text-text-subtle">
                          {' '}
                          · licensed to {formatLicenceDate(brief.licenseExpiresAt)}
                        </span>
                      )}
                    </dd>
                  </dl>

                  <PublishControls
                    setPieceId={brief.id}
                    status={brief.status}
                    blockedBecause={brief.publishBlockedBecause}
                    hasOpened={brief.opensAt.getTime() <= now.getTime()}
                  />
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      <section className="flex flex-col gap-2">
        <SectionLabel>Writing a new brief</SectionLabel>
        <p className="text-text-muted text-sm leading-normal">
          {/*
           * Stated rather than hidden. An authoring form needs a Mux upload for the
           * tutorial video, and the upload pipeline is Prompt 8 — building half of it here
           * would mean rebuilding it there.
           */}
          The authoring form arrives with the upload pipeline in Prompt 8, which is what a tutorial
          video needs. Until then briefs are created by seed or by migration, and published here.
        </p>
      </section>
    </main>
  );
}

/** Drop windows are days and hours away, so the year would be noise. */
function formatDateTime(date: Date): string {
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Licence expiry ALWAYS carries the year.
 *
 * Without it, a licence running to 22 Aug 2027 renders as "22 Aug" and reads as expiring
 * today — on the one screen whose entire job is telling an administrator when a licence
 * runs out. Found by looking at the rendered page rather than the code.
 */
function formatLicenceDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
