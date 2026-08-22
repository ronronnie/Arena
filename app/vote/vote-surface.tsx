'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RevealCard } from '@/components/motion/reveal-card';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle, SectionLabel } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ProgressRing } from '@/components/ui/progress-ring';
import { VideoTile, type VideoTileHandle } from '@/components/ui/video-tile';
import { UNLOCK_THRESHOLD } from '@/lib/config/hypotheses';
import type { BlindEntry, BlindPair, RevealedCompetitor } from '@/lib/db';
import { cn } from '@/lib/ui/cn';
import { drawPair, submitVote } from './actions';

/**
 * The voting surface. The most important screen in the product.
 *
 * The whole design serves one number: a vote every eight to twelve seconds. Everything
 * here is in service of that, or in service of the vote being honest.
 *
 * **What makes it fast.** The next pair is fetched while the current one is still on
 * screen, so the tap after the reveal has nothing to wait for. Clips autoplay muted and
 * loop, so the judge never presses play. Both choices are a single tap.
 *
 * **What makes it honest.** Nothing on this screen identifies anybody until a vote is
 * recorded — no name, no avatar, no follower count, no caption. The reveal is a state
 * change on the server, so a curious client cannot ask for it early.
 *
 * **The scrub-sync.** Because everyone performed the SAME brief, a judge can drag both
 * clips to the same moment and compare like with like. No other platform can offer this,
 * because no other platform has everybody doing the same thing. It is the one control on
 * this screen that is not about speed.
 */

type Phase = 'loading' | 'judging' | 'revealing' | 'exhausted';

/** Enough of a clip to count as having watched it, for the vote-quality signal. */
const WATCHED_THRESHOLD = 0.35;

export function VoteSurface({
  setPieceId,
  initialPair,
  startingCompleted,
  briefTitle,
}: {
  setPieceId: string;
  initialPair: BlindPair | null;
  startingCompleted: number;
  briefTitle: string;
}) {
  const [pair, setPair] = useState<BlindPair | null>(initialPair);
  const [phase, setPhase] = useState<Phase>(initialPair === null ? 'exhausted' : 'judging');
  const [revealed, setRevealed] = useState<RevealedCompetitor[]>([]);
  const [pickedEntryId, setPickedEntryId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(startingCompleted);
  const [problem, setProblem] = useState<string | null>(null);
  const [unmutedSide, setUnmutedSide] = useState<'a' | 'b' | null>(null);
  const [scrubSync, setScrubSync] = useState(false);

  /**
   * The pair after this one, handed back by the vote that just finished.
   *
   * NOT prefetched with a separate action. Next serialises server actions from a client,
   * so a prefetch in flight delays the vote behind it — which made the screen hang for
   * seconds at a time, and got worse the faster somebody voted.
   */
  const prefetched = useRef<BlindPair | null>(null);
  /*
   * Set in an effect rather than at construction: `Date.now()` during render is impure and
   * would drift on any re-render, which would quietly corrupt the time-to-decision signal
   * that Prompt 14 weighs votes by.
   */
  const shownAt = useRef<number>(0);
  const leftVideo = useRef<VideoTileHandle | null>(null);
  const rightVideo = useRef<VideoTileHandle | null>(null);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [pair?.comparisonId]);

  const advance = useCallback(async () => {
    setRevealed([]);
    setPickedEntryId(null);
    setUnmutedSide(null);
    setScrubSync(false);

    /*
     * Usually the next pair is already here. When it is not — the judge was faster than
     * the prefetch — fetch it now rather than treating "not ready yet" as "nothing left".
     * An earlier version made exactly that mistake and ended a session at the first fast
     * tap, which is the opposite of the behaviour this screen is built for.
     */
    let next = prefetched.current;
    prefetched.current = null;

    if (next === null) {
      setPhase('loading');
      next = (await drawPair(setPieceId)).pair;
    }

    if (next === null) {
      setPair(null);
      setPhase('exhausted');
      return;
    }

    setPair(next);
    setPhase('judging');
  }, [setPieceId]);

  const decide = useCallback(
    async (winnerEntryId: string | null) => {
      if (pair === null || phase !== 'judging') return;

      /*
       * Optimistic: the reveal starts flipping before the server answers. If the vote is
       * refused we roll back to judging and say so — but the common case is that it
       * worked, and making everyone wait for confirmation of the common case is how a
       * twelve-second loop becomes a twenty-second one.
       */
      setPickedEntryId(winnerEntryId);
      setPhase('revealing');

      const bothWatched =
        (leftVideo.current?.watchedFraction() ?? 0) >= WATCHED_THRESHOLD &&
        (rightVideo.current?.watchedFraction() ?? 0) >= WATCHED_THRESHOLD;

      const result = await submitVote({
        setPieceId,
        comparisonId: pair.comparisonId,
        winnerEntryId,
        /*
         * `shownAt` is 0 until the timing effect runs. A tap in that window would send
         * the whole Unix epoch as an elapsed time — which the server clamps, but sending
         * a fabricated number at all would corrupt the signal rather than omit it.
         */
        decisionMs: shownAt.current === 0 ? 0 : Date.now() - shownAt.current,
        bothWatched,
        previousCompleted: completed,
      });

      if (!result.ok) {
        setProblem(result.problem);
        setPhase('judging');
        setPickedEntryId(null);
        return;
      }

      setProblem(null);
      setCompleted(result.comparisonsCompleted);
      setRevealed(result.revealed);
      prefetched.current = result.nextPair;

      // A skip has no reveal, so there is no reward to sit on — go straight to the next.
      if (winnerEntryId === null) await advance();
    },
    [pair, phase, completed, advance, setPieceId],
  );

  /** Drag one clip, both move. Only possible because both performed the same brief. */
  const onScrub = useCallback((fraction: number) => {
    for (const video of [leftVideo.current, rightVideo.current]) {
      if (video === null) continue;
      const duration = video.duration();
      if (duration > 0) video.seek(duration * fraction);
    }
  }, []);

  if (phase === 'exhausted' || pair === null) {
    return (
      <div className="flex flex-col gap-6">
        <Progress completed={completed} />
        <EmptyState
          title="You have judged everything on this brief"
          description="New pairs appear as more competitors enter. That is the whole session — nothing else is waiting for you."
        />
      </div>
    );
  }

  const isRevealing = phase === 'revealing' && revealed.length > 0;
  const winner = revealed.find((competitor) => competitor.won);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <SectionLabel>Which is better?</SectionLabel>
        <p className="text-text-muted text-sm">{briefTitle}</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Side
          entry={pair.a}
          side="a"
          marker="A"
          videoRef={leftVideo}
          revealed={isRevealing}
          competitor={revealed.find((c) => c.entryId === pair.a.id)}
          dimmed={isRevealing && pickedEntryId !== null && pickedEntryId !== pair.a.id}
          muted={unmutedSide !== 'a'}
          onToggleMuted={() => setUnmutedSide((current) => (current === 'a' ? null : 'a'))}
        />
        <Side
          entry={pair.b}
          side="b"
          marker="B"
          videoRef={rightVideo}
          revealed={isRevealing}
          competitor={revealed.find((c) => c.entryId === pair.b.id)}
          dimmed={isRevealing && pickedEntryId !== null && pickedEntryId !== pair.b.id}
          muted={unmutedSide !== 'b'}
          onToggleMuted={() => setUnmutedSide((current) => (current === 'b' ? null : 'b'))}
        />
      </div>

      {phase === 'judging' && (
        <>
          <ScrubSync
            enabled={scrubSync}
            onToggle={() => setScrubSync((v) => !v)}
            onScrub={onScrub}
          />

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3">
              <Button variant="primary" size="lg" onClick={() => void decide(pair.a.id)}>
                Pick A
              </Button>
              <Button variant="primary" size="lg" onClick={() => void decide(pair.b.id)}>
                Pick B
              </Button>
            </div>
            {/*
             * Skip is deliberately quieter than the two choices but always present. "I
             * cannot tell these apart" is real information about the pairing, and a judge
             * with no way to say it will guess instead.
             */}
            <Button variant="ghost" size="sm" block onClick={() => void decide(null)}>
              Too close to call
            </Button>
          </div>
        </>
      )}

      {isRevealing && (
        <div className="flex flex-col gap-3" aria-live="polite">
          <p className="font-display text-lg leading-snug font-semibold tracking-tight">
            You picked {winner?.displayName ?? 'neither'}
          </p>
          <Button variant="primary" size="lg" block onClick={() => void advance()} autoFocus>
            Next pair
          </Button>
        </div>
      )}

      {problem !== null && (
        <p role="alert" className="text-negative text-sm">
          {problem}
        </p>
      )}

      <Progress completed={completed} />
    </div>
  );
}

function Side({
  entry,
  side,
  marker,
  videoRef,
  revealed,
  competitor,
  dimmed,
  muted,
  onToggleMuted,
}: {
  entry: BlindEntry;
  side: 'a' | 'b';
  marker: string;
  videoRef: React.RefObject<VideoTileHandle | null>;
  revealed: boolean;
  competitor: RevealedCompetitor | undefined;
  dimmed: boolean;
  muted: boolean;
  onToggleMuted: () => void;
}) {
  const source = entry.fixturePath ?? entry.muxPlaybackId ?? '';

  return (
    <div className="flex flex-col gap-2" data-side={side}>
      <RevealCard
        revealed={revealed}
        front={
          /*
           * The tile is NOT wrapped in a "choose this one" button.
           *
           * It was, and it was wrong twice over: `VideoTile` has its own control inside it,
           * so the markup nested a button in a button — invalid HTML, which React reported
           * as a hydration mismatch and recovered from by regenerating the tree, wiping the
           * vote in progress. It is also a genuine accessibility fault; nested interactive
           * controls have no sensible keyboard or screen-reader behaviour.
           *
           * So the roles are split the way the design intends anyway: tapping a clip
           * unmutes it, and choosing is the explicit Pick button below.
           */
          <VideoTile
            ref={videoRef}
            src={source}
            marker={marker}
            // Never a name. There is nothing here that could become one.
            label={`Performance ${marker}`}
            autoPlay
            muted={muted}
            onToggleMuted={onToggleMuted}
            dimmed={dimmed}
          />
        }
        back={
          <Card
            className={cn(
              'items-center gap-1 p-3 text-center',
              competitor?.won === true && 'border-accent-base',
            )}
          >
            <span className="arena-label">{marker}</span>
            <CardTitle className="text-sm">{competitor?.displayName ?? '—'}</CardTitle>
            <CardDescription className="text-xs">
              {competitor === undefined ? '' : `@${competitor.handle}`}
            </CardDescription>
            {competitor?.won === true && (
              <span className="arena-label text-accent-text">Your pick</span>
            )}
          </Card>
        }
      />
    </div>
  );
}

/**
 * The scrub-sync — the showpiece.
 *
 * Off by default because most votes do not need it: the point of the screen is a decision
 * every ten seconds, and a scrubber on by default invites study. It is there for the pairs
 * that are genuinely close, which is exactly when a judge should be able to line the two
 * performances up at the same beat.
 */
function ScrubSync({
  enabled,
  onToggle,
  onScrub,
}: {
  enabled: boolean;
  onToggle: () => void;
  onScrub: (fraction: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" onClick={onToggle} aria-pressed={enabled}>
        {enabled ? 'Hide the scrubber' : 'Compare the same moment'}
      </Button>

      {enabled && (
        <label className="flex flex-col gap-1">
          <span className="arena-label">Both clips together</span>
          <input
            type="range"
            min={0}
            max={100}
            defaultValue={0}
            aria-label="Scrub both performances to the same moment"
            onChange={(event) => onScrub(Number(event.target.value) / 100)}
            className="min-h-[var(--arena-touch-target)] w-full accent-[var(--arena-accent-base)]"
          />
          <span className="text-text-subtle text-xs">
            Both competitors performed the same brief, so the same moment is comparable.
          </span>
        </label>
      )}
    </div>
  );
}

function Progress({ completed }: { completed: number }) {
  const unlocked = completed >= UNLOCK_THRESHOLD;

  return (
    <section className="border-line flex items-center gap-4 border-t pt-4">
      <ProgressRing
        value={Math.min(completed, UNLOCK_THRESHOLD)}
        max={UNLOCK_THRESHOLD}
        label="comparisons judged"
        size={64}
        caption={unlocked ? 'unlocked' : 'judged'}
      />
      <p className="text-text-muted text-sm leading-normal">
        {unlocked
          ? 'You can enter briefs. Most people here only ever judge, and that is the point.'
          : `Judge ${UNLOCK_THRESHOLD - completed} more and the option to enter opens up.`}
      </p>
    </section>
  );
}
