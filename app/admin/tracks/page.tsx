import { Card, CardTitle, SectionLabel } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { getActor } from '@/lib/auth/session';
import { LICENCE_WARNING_DAYS, listTracks } from '@/lib/db';
import { cn } from '@/lib/ui/cn';

/**
 * The track licence catalogue.
 *
 * Sorted by expiry, never by title. The useful question on this screen is never "where is
 * that track" — it is "what is about to stop being usable", because a licence lapsing
 * mid-drop means hosting unlicensed performances by people who trusted us to have checked.
 *
 * Anything inside 30 days is flagged in words and by position, not by colour alone.
 */
export const dynamic = 'force-dynamic';

export default async function AdminTracksPage() {
  const actor = await getActor();
  const tracks = await listTracks(actor);

  const attention = tracks.filter((track) => track.needsAttention);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl leading-snug font-bold tracking-tight">
          Track licences
        </h1>
        <p className="text-text-muted text-sm">
          {tracks.length} licensed. {attention.length} lapsing within {LICENCE_WARNING_DAYS} days or
          already lapsed.
        </p>
      </div>

      {tracks.length === 0 ? (
        <EmptyState
          title="No tracks are licensed"
          description="A brief cannot be published without a track whose licence covers the whole drop."
        />
      ) : (
        <ol className="flex flex-col gap-4">
          {tracks.map((track) => (
            <li key={track.id}>
              <Card className={cn(track.needsAttention && 'border-caution')}>
                <div className="flex items-center justify-between gap-3">
                  <span className="arena-label">{track.licenseType.replace('_', ' ')}</span>
                  <span
                    className={cn(
                      'arena-label',
                      track.hasExpired
                        ? 'text-negative'
                        : track.needsAttention
                          ? 'text-caution'
                          : 'text-text-muted',
                    )}
                  >
                    {/* In words. A coloured border alone would be invisible to a lot of people. */}
                    {track.hasExpired
                      ? 'Lapsed'
                      : track.expiresInDays <= LICENCE_WARNING_DAYS
                        ? `${track.expiresInDays} days left`
                        : 'In date'}
                  </span>
                </div>

                <CardTitle className="text-base">{track.title}</CardTitle>
                <p className="text-text-muted text-sm">{track.artist}</p>

                <dl className="text-text-muted grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="arena-label">Licensor</dt>
                  <dd>{track.licensor}</dd>
                  <dt className="arena-label">Window</dt>
                  <dd className="arena-numeric">
                    {formatDate(track.licenseStartsAt)} — {formatDate(track.licenseExpiresAt)}
                  </dd>
                  <dt className="arena-label">Territory</dt>
                  <dd>{track.territory.join(', ')}</dd>
                  {track.contractRef !== null && (
                    <>
                      <dt className="arena-label">Contract</dt>
                      <dd className="font-mono text-xs">{track.contractRef}</dd>
                    </>
                  )}
                </dl>
              </Card>
            </li>
          ))}
        </ol>
      )}

      <section className="flex flex-col gap-2">
        <SectionLabel>Adding a licence</SectionLabel>
        <p className="text-text-muted text-sm leading-normal">
          Licensing a track is a contract, not a form field. `createTrack` exists in the data-access
          layer and takes the window, the territory and the contract reference; the screen for it
          should arrive alongside whoever will actually be doing the licensing.
        </p>
      </section>
    </main>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
