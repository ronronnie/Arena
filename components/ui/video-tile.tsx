'use client';

import { useId, useImperativeHandle, useRef, useState, type RefObject } from 'react';
import { cn } from '@/lib/ui/cn';

/**
 * VideoTile — one performance, in a portrait frame.
 *
 * This is where "video is the colour" becomes literal. The chrome around a tile is
 * near-monochrome and the letterbox is `surface-sunken`, so wildly inconsistent user
 * footage sits in a neutral room instead of clashing with a loud UI.
 *
 * **Core rule 3 is enforced by the props.** There is no `competitor`, `handle`, `avatar`
 * or `userId` here, and there must never be one. A tile receives a source and an optional
 * neutral marker ("A" / "B"), which is exactly what the blind view can supply. Adding an
 * identity prop would let a caller leak one during a vote, so the type is the guard.
 */

/** What a parent can drive from outside — used by the scrub-sync in the voting screen. */
export type VideoTileHandle = {
  seek: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  currentTime: () => number;
  duration: () => number;
  /** Fraction of the clip actually played, 0 to 1. Feeds the "watched both" signal. */
  watchedFraction: () => number;
};

export type VideoTileProps = {
  /** A committed fixture path, or a Mux playback URL once Prompt 8 lands. */
  src: string;
  poster?: string;
  /**
   * A neutral position marker shown in the corner. "A" or "B" during a blind comparison.
   * Never a name.
   */
  marker?: string;
  /** Description for assistive technology. Must not identify the competitor either. */
  label: string;
  /** Dims the tile and stops playback — used for the option a voter did not choose. */
  dimmed?: boolean;
  /**
   * Start playing immediately. Only ever with `muted`, because every browser blocks
   * autoplay with sound and a silent failure is worse than not trying.
   */
  autoPlay?: boolean;
  /** Controlled mute. The voting screen lets a judge unmute one clip at a time. */
  muted?: boolean;
  /** Tapping the frame unmutes rather than pausing. */
  onToggleMuted?: () => void;
  ref?: RefObject<VideoTileHandle | null>;
  className?: string;
};

export function VideoTile({
  src,
  poster,
  marker,
  label,
  dimmed = false,
  autoPlay = false,
  muted = true,
  onToggleMuted,
  ref,
  className,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(autoPlay);
  const watched = useRef(0);
  const captionId = useId();

  useImperativeHandle(ref, () => ({
    seek: (seconds: number) => {
      const video = videoRef.current;
      if (video !== null) video.currentTime = seconds;
    },
    play: () => void videoRef.current?.play().catch(() => undefined),
    pause: () => videoRef.current?.pause(),
    currentTime: () => videoRef.current?.currentTime ?? 0,
    duration: () => videoRef.current?.duration ?? 0,
    watchedFraction: () => watched.current,
  }));

  const onTap = (): void => {
    if (onToggleMuted !== undefined) {
      onToggleMuted();
      return;
    }

    const video = videoRef.current;
    if (video === null) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <div
        className={cn(
          'bg-surface-sunken border-line relative overflow-hidden rounded-lg border',
          'aspect-[9/16] w-full',
          dimmed && 'opacity-40 saturate-50',
          'ease-standard transition-opacity duration-[var(--arena-duration-base)]',
        )}
      >
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          aria-describedby={captionId}
          className="h-full w-full object-contain"
          playsInline
          loop
          autoPlay={autoPlay}
          muted={muted}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            if (video.duration > 0) {
              // Highest point reached, not current position — scrubbing back should not
              // undo the fact that somebody watched it.
              watched.current = Math.max(watched.current, video.currentTime / video.duration);
            }
          }}
        />

        {/*
         * The whole tile is the control. A 48px floor is irrelevant here — the target is
         * the entire frame — but it still has to be reachable and announced by keyboard.
         */}
        <button
          type="button"
          onClick={onTap}
          aria-pressed={onToggleMuted === undefined ? playing : !muted}
          className="absolute inset-0 flex items-center justify-center bg-transparent"
        >
          <span className="sr-only">
            {onToggleMuted !== undefined
              ? muted
                ? `Unmute ${label}`
                : `Mute ${label}`
              : playing
                ? `Pause ${label}`
                : `Play ${label}`}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'bg-overlay text-text-inverse grid size-14 place-items-center rounded-full',
              'transition-opacity duration-[var(--arena-duration-fast)]',
              onToggleMuted !== undefined
                ? muted
                  ? 'opacity-90'
                  : 'opacity-0'
                : playing
                  ? 'opacity-0'
                  : 'opacity-100',
            )}
          >
            {onToggleMuted !== undefined ? (
              <MutedGlyph />
            ) : (
              <svg viewBox="0 0 24 24" className="size-6 translate-x-[1px] fill-current">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </span>
        </button>

        {marker !== undefined && (
          <span
            aria-hidden="true"
            className={cn(
              'bg-overlay text-text-inverse absolute top-2 left-2 rounded-sm px-2 py-1',
              'text-2xs font-mono font-semibold tracking-widest uppercase',
            )}
          >
            {marker}
          </span>
        )}
      </div>

      <figcaption id={captionId} className="sr-only">
        {label}
      </figcaption>
    </figure>
  );
}

function MutedGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="m23 9-6 6M17 9l6 6" />
    </svg>
  );
}
