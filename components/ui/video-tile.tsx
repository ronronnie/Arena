'use client';

import { useId, useRef, useState } from 'react';
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
  className?: string;
};

export function VideoTile({
  src,
  poster,
  marker,
  label,
  dimmed = false,
  className,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const captionId = useId();

  const toggle = (): void => {
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
          muted
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />

        {/*
         * The whole tile is the play control. A 48px floor is irrelevant here — the target
         * is the entire frame — but it still has to be reachable and announced by keyboard.
         */}
        <button
          type="button"
          onClick={toggle}
          aria-pressed={playing}
          className="absolute inset-0 flex items-center justify-center bg-transparent"
        >
          <span className="sr-only">{playing ? `Pause ${label}` : `Play ${label}`}</span>
          <span
            aria-hidden="true"
            className={cn(
              'bg-overlay text-text-inverse grid size-14 place-items-center rounded-full',
              'transition-opacity duration-[var(--arena-duration-fast)]',
              playing ? 'opacity-0' : 'opacity-100',
            )}
          >
            <svg viewBox="0 0 24 24" className="size-6 translate-x-[1px] fill-current">
              <path d="M8 5v14l11-7z" />
            </svg>
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
